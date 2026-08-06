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
import { cancelAndRefund } from "@/lib/order-lifecycle";
import { sendOrderAcceptedEmail } from "@/lib/order-email";

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

  // ACCEPT IS THE OTHER HALF OF THE CANCEL RACE. The customer's cancel claims
  // the order with a conditional `WHERE status = 'pending'` update (see
  // lib/order-lifecycle CancelOptions.onlyIfStatus), so exactly one of the two
  // can win — but only if THIS side is conditional too. Unguarded, an accept
  // that read 'pending' a moment before the cancel landed would overwrite a
  // cancelled, already-refunded order back to 'received' and email the customer
  // that it was accepted. Advancing an accepted order is left unguarded: those
  // transitions are the owner's alone and race with nothing.
  const applyStatus = (values: Record<string, unknown>) => {
    const q = supabase.from("orders").update(values).eq("id", params.id);
    return (isAccept ? q.eq("status", "pending") : q).select("id");
  };

  let { data: changed, error } = await applyStatus(patch);
  // Degrade gracefully if updated_at / accepted_at don't exist (pre-27 DB).
  if (error && isMissingColumn(error)) {
    ({ data: changed, error } = await applyStatus({ status }));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Lost the claim — the order left 'pending' between the read above and this
  // update. Two very different reasons, and they must not be reported the same
  // way: a DOUBLE-CLICKED Accept loses it to its own twin (harmless, and the
  // owner's intent was carried out), whereas a CANCELLATION landing first means
  // the order is refunded and accepting it would be wrong. So re-read the row
  // and answer for what actually happened.
  if (isAccept && (!changed || changed.length === 0)) {
    const { data: now } = await supabase
      .from("orders")
      .select("status")
      .eq("id", params.id)
      .maybeSingle();
    if (String(now?.status ?? "").toLowerCase() !== status) {
      return NextResponse.json(
        { error: "This order was cancelled before it could be accepted." },
        { status: 409 },
      );
    }
    // Already accepted by the request we raced. Fall through: the answer is the
    // same one that request gives, and the email ledger makes the send a no-op.
  }

  // On acceptance, email the customer that their order is accepted
  // (best-effort — never blocks the status change).
  //
  // `isAccept` is the pending → received transition and NOTHING else, so
  // advancing an already-accepted order through preparing/ready/delivered
  // never re-sends it. A double-clicked Accept passes this check twice (both
  // requests read the same 'pending' row), which is exactly what the ledger
  // inside sendOrderAcceptedEmail is for: the second send is a no-op.
  if (isAccept) {
    await sendOrderAcceptedEmail(supabase, params.id);
  }

  return NextResponse.json({ order: { id: params.id } });
}
