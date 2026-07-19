// ============================================================
// Admin API — one order: read detail (GET) + update status (PUT)
// Service-role, password-gated.
//
// PUT drives the owner-approval workflow:
//   • Accept:  pending → received   (records accepted_at, emails customer)
//   • Advance: received → preparing → ready → out_for_delivery → delivered
//   • Cancel:  → cancelled + Stripe refund (shared cancelAndRefund)
//
// GET returns the payment / refund detail the Orders drawer shows for a
// cancelled order (payment status, refund id, any refund error).
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { cancelAndRefund, orderNumberOf } from "@/lib/order-lifecycle";
import { notifyLifecycle } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// Every status the admin may move an order INTO. 'pending' is the arrival
// state only — the owner never sets an order back to pending.
const VALID_STATUSES = [
  "received",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;

/** True when an update failed only because a column doesn't exist yet
 *  (27_order_lifecycle.sql not run). Lets us retry with core columns. */
function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "PGRST204") return true;
  return /column .* does not exist|could not find the .* column/i.test(err.message ?? "");
}

// ------------------------------------------------------------
// GET — full detail for the drawer (payment + refund fields).
// ------------------------------------------------------------
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const supabase = createAdminClient() as unknown as SupabaseClient;
  // select("*") tolerates pre-27 databases (payment columns may be absent).
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const o = data as Record<string, unknown>;
  return NextResponse.json({
    order: {
      id: String(o.id),
      status: String(o.status ?? ""),
      payment_status: String(o.payment_status ?? "paid"),
      accepted_at: o.accepted_at ?? null,
      cancelled_at: o.cancelled_at ?? null,
      refunded_at: o.refunded_at ?? null,
      refund_id: (o.refund_id as string | null) ?? null,
      refund_error: (o.refund_error as string | null) ?? null,
      total: Number(o.total ?? o.amount ?? 0),
    },
  });
}

// ------------------------------------------------------------
// PUT — change status (accept / advance / cancel).
// ------------------------------------------------------------
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const status = body.status;

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabase = createAdminClient() as unknown as SupabaseClient;

  // Load the current order (need its previous status + contact + payment ref).
  const { data: order, error: loadErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const prev = String(order.status ?? "").toLowerCase();

  // --- Cancel: cancel AND refund (shared with customer + auto sweep). ---
  if (status === "cancelled") {
    if (prev === "cancelled") {
      return NextResponse.json({
        order: { id: params.id },
        payment_status: String(order.payment_status ?? "refunded"),
      });
    }
    const result = await cancelAndRefund(supabase, order, "admin");
    return NextResponse.json({
      order: { id: params.id },
      payment_status: result.paymentStatus,
      refund_error: result.refundError ?? null,
    });
  }

  // --- Accept / advance: a plain status update. ---
  const isAccept = status === "received" && prev === "pending";
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (isAccept && !order.accepted_at) patch.accepted_at = new Date().toISOString();

  let { error } = await supabase.from("orders").update(patch).eq("id", params.id);
  // Degrade gracefully if updated_at / accepted_at don't exist (pre-27 DB).
  if (error && isMissingColumn(error)) {
    ({ error } = await supabase.from("orders").update({ status }).eq("id", params.id));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // On acceptance, email the customer that their order is confirmed
  // (best-effort — never blocks the status change).
  if (isAccept) {
    try {
      await notifyLifecycle(supabase, "accepted", {
        orderNumber: orderNumberOf(params.id),
        customerName: String(order.customer_name ?? ""),
        email: String(order.email ?? ""),
        total: Number(order.total ?? order.amount ?? 0),
      });
    } catch (e) {
      console.error("[admin/orders] accept notify failed:", e);
    }
  }

  return NextResponse.json({ order: { id: params.id } });
}
