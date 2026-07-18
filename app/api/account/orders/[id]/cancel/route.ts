// ============================================================
// POST /api/account/orders/[id]/cancel
// Lets a signed-in customer cancel THEIR OWN order while it is still in
// an early, cancellable state. Authenticates via the Supabase session
// (verified email), confirms the order belongs to that email, checks the
// current status is cancellable, then sets status = 'cancelled' with the
// service role. The admin panel and analytics read the same column, so
// they reflect the change on their next read.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Statuses from which a customer may still cancel (normalised lowercase).
const CANCELLABLE = new Set(["pending", "received", "preparing", "processing"]);

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

  // 3) Fetch the order and confirm ownership + cancellable status.
  const { data: order, error: readErr } = await admin
    .from("orders")
    .select("id,email,status")
    .eq("id", orderId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!order || (order.email ?? "").toLowerCase() !== email.toLowerCase()) {
    // Don't reveal existence of other customers' orders.
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const current = String(order.status ?? "").toLowerCase();
  if (current === "cancelled") {
    // Idempotent — already cancelled.
    return NextResponse.json({ status: "cancelled" });
  }
  if (!CANCELLABLE.has(current)) {
    return NextResponse.json(
      { error: "This order can no longer be cancelled." },
      { status: 409 },
    );
  }

  // 4) Cancel. `updated_at` is best-effort — retried without it if absent.
  let { error: updErr } = await admin
    .from("orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("email", email);

  if (updErr && /updated_at/i.test(updErr.message)) {
    ({ error: updErr } = await admin
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", orderId)
      .eq("email", email));
  }

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ status: "cancelled" });
}
