// ============================================================
// POST /api/account/orders/[id]/cancel
// Lets a signed-in customer cancel THEIR OWN order — but ONLY while it is
// still Pending (awaiting owner acceptance). Once the owner accepts it
// (status Received onward) it can no longer be cancelled here.
//
// Authenticates via the Supabase session (verified email), confirms the
// order belongs to that email and is still Pending, then cancels AND
// refunds it (shared lib/order-lifecycle.cancelAndRefund), which reuses
// the existing Stripe integration and notifies both parties. The admin
// panel and analytics read the same columns, so they reflect the change
// on their next read.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { cancelAndRefund } from "@/lib/order-lifecycle";

export const dynamic = "force-dynamic";

// A customer may cancel ONLY while the order is Pending (not yet accepted
// by the owner). Normalised lowercase.
const CANCELLABLE = new Set(["pending"]);

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const orderId = String(params?.id ?? "").trim();
  if (!orderId) {
    return NextResponse.json({ error: "Missing order id." }, { status: 400 });
  }

  // 1) Verified caller.
  let email: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? null;
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // 2) Service-role client (scoped strictly to this caller's email below).
  let admin: SupabaseClient;
  try {
    admin = createAdminClient() as unknown as SupabaseClient;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server not configured." },
      { status: 500 },
    );
  }

  // 3) Fetch the order and confirm ownership + that it's still Pending.
  //    select("*") keeps this resilient to schema drift (payment columns may
  //    or may not exist) — cancelAndRefund reads what it needs defensively.
  const { data: order, error: readErr } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!order || String(order.email ?? "").toLowerCase() !== email.toLowerCase()) {
    // Don't reveal existence of other customers' orders.
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const current = String(order.status ?? "").toLowerCase();
  if (current === "cancelled") {
    // Idempotent — already cancelled. Report the payment side too.
    return NextResponse.json({
      status: "cancelled",
      payment_status: String(order.payment_status ?? "refunded"),
    });
  }
  if (!CANCELLABLE.has(current)) {
    return NextResponse.json(
      {
        error:
          "This order has already been accepted and can no longer be cancelled.",
      },
      { status: 409 },
    );
  }

  // 4) Cancel AND refund (shared with the 24h auto-cancel sweep). Reuses the
  //    existing Stripe integration; never throws. A Stripe failure leaves the
  //    order Cancelled with payment_status 'refund_pending' for admin retry.
  const result = await cancelAndRefund(admin, order, "customer");

  return NextResponse.json({
    status: result.status,
    payment_status: result.paymentStatus,
  });
}
