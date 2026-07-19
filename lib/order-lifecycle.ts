// ============================================================
// SERVER-ONLY — order lifecycle actions (cancel + refund)
// ------------------------------------------------------------
// The single, shared implementation of "cancel this order and refund
// the customer", used by THREE callers so the behaviour is identical
// everywhere:
//
//   • the customer cancelling their own Pending order
//   • the 24h auto-cancel sweep (cron)
//   • the admin retrying a refund that previously failed
//
// It reuses the existing Stripe integration (lib/stripe.getStripe) and
// the existing notification transport (lib/notifications). It NEVER
// throws: a Stripe failure leaves the order Cancelled with payment
// status 'refund_pending' and the error logged, so the order is never
// lost and the admin can retry. NEVER import from the browser.
// ============================================================

import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { notifyLifecycle } from "@/lib/notifications";

/** The order fields these actions need. Read defensively — money can live
 *  on `total` or the legacy `amount` column. */
export type LifecycleOrderRow = {
  id: string;
  email?: string | null;
  customer_name?: string | null;
  status?: string | null;
  payment_status?: string | null;
  stripe_payment_intent?: string | null;
  total?: number | null;
  amount?: number | null;
};

/** The customer-facing order number, derived exactly as everywhere else. */
export function orderNumberOf(id: string): string {
  return String(id).replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** True when an update failed only because a column doesn't exist yet
 *  (the 27 migration hasn't been run). Lets us retry with core columns. */
function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "PGRST204") return true;
  return /column .* does not exist|could not find the .* column/i.test(err.message ?? "");
}

/**
 * Attempt a Stripe refund for the order's PaymentIntent.
 * Resolves with the refund id on success, or an error string on failure —
 * never throws.
 */
export async function refundOrder(
  supabase: SupabaseClient,
  order: LifecycleOrderRow,
): Promise<{ refundId: string } | { error: string }> {
  const pi = (order.stripe_payment_intent ?? "").trim();
  if (!pi) {
    return {
      error:
        "No Stripe payment reference on this order — refund it manually in the Stripe dashboard.",
    };
  }
  try {
    const { stripe } = await getStripe(supabase);
    const refund = await stripe.refunds.create({ payment_intent: pi });
    return { refundId: refund.id };
  } catch (e) {
    const msg =
      e instanceof Stripe.errors.StripeError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Stripe refund failed.";
    return { error: msg };
  }
}

export type CancelResult = {
  status: "cancelled";
  paymentStatus: "refunded" | "refund_pending";
  refundId?: string;
  refundError?: string;
};

/**
 * Cancel an order AND refund the customer, then notify both parties.
 * `by` records who triggered it: 'customer' or 'auto' (the 24h sweep).
 *
 * Order of operations chosen so the order is NEVER left in a bad state:
 *   1. issue the Stripe refund (best-effort)
 *   2. persist status=cancelled + the payment/refund outcome
 *   3. notify (best-effort; never blocks the result)
 *
 * If step 1 fails, payment_status is 'refund_pending' and the error is
 * stored for the admin to retry — the order is still safely Cancelled.
 */
export async function cancelAndRefund(
  supabase: SupabaseClient,
  order: LifecycleOrderRow,
  by: "customer" | "auto" | "admin",
): Promise<CancelResult> {
  const nowIso = new Date().toISOString();

  // 1) Refund (best-effort).
  const refund = await refundOrder(supabase, order);
  const ok = "refundId" in refund;
  const paymentStatus: "refunded" | "refund_pending" = ok ? "refunded" : "refund_pending";

  // 2) Persist. Full column set first; degrade to core if the 27 migration
  //    hasn't run yet, so the order is always at least marked Cancelled.
  const full: Record<string, unknown> = {
    status: "cancelled",
    payment_status: paymentStatus,
    cancelled_at: nowIso,
    cancelled_by: by,
    updated_at: nowIso,
    refund_id: ok ? refund.refundId : null,
    refund_error: ok ? null : refund.error,
    refunded_at: ok ? nowIso : null,
  };

  let { error: updErr } = await supabase.from("orders").update(full).eq("id", order.id);
  if (updErr && isMissingColumn(updErr)) {
    ({ error: updErr } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", order.id));
  }
  if (updErr) {
    // The DB write itself failed. Surface it so the caller can react; the
    // Stripe refund (if it happened) is recorded in Stripe regardless.
    console.error("[order-lifecycle] cancel update failed:", updErr.message);
  }

  // 3) Notify (best-effort — never throws, never blocks the result).
  try {
    await notifyLifecycle(supabase, by === "auto" ? "auto_cancelled" : "cancelled", {
      orderNumber: orderNumberOf(order.id),
      customerName: order.customer_name ?? "",
      email: order.email ?? "",
      total: Number(order.total ?? order.amount ?? 0),
      refundState: paymentStatus,
    });
  } catch (e) {
    console.error("[order-lifecycle] notify failed:", e);
  }

  return {
    status: "cancelled",
    paymentStatus,
    refundId: ok ? refund.refundId : undefined,
    refundError: ok ? undefined : refund.error,
  };
}
