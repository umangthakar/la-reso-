// ============================================================
// SERVER-ONLY — order lifecycle actions (cancel + refund)
// ------------------------------------------------------------
// The single, shared implementation of "cancel this order and refund
// the customer", used by THREE callers so the behaviour is identical
// everywhere:
//
//   • the customer cancelling their own Pending order
//   • the auto-cancel sweep (cron; window in lib/order-timeout)
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
import { sendRefundNotification } from "@/lib/ntfy";

/** The order fields these actions need. Read defensively — money can live
 *  on `total` or the legacy `amount` column. */
export type LifecycleOrderRow = {
  id: string;
  email?: string | null;
  customer_name?: string | null;
  status?: string | null;
  payment_status?: string | null;
  stripe_payment_intent?: string | null;
  /** Set once a Stripe refund has succeeded — the double-refund guard. */
  refund_id?: string | null;
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

/** True when an RPC failed only because the function doesn't exist yet
 *  (the 39 migration hasn't been run). Lets us fall back to plain updates. */
function isMissingFunction(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  // PGRST202 = no matching function in the schema cache; 42883 = undefined_function.
  if (err.code === "PGRST202" || err.code === "42883") return true;
  return /could not find the function|function .* does not exist/i.test(err.message ?? "");
}

/**
 * The Stripe idempotency key for refunding an order.
 *
 * Deterministic from the order id, and deliberately NOT scoped to the caller:
 * the customer-cancel path, the auto-cancel sweep and the admin retry tool all derive
 * the same key, so if two of them race to refund the same order Stripe issues
 * ONE refund and returns it to both, instead of paying the customer twice.
 *
 * Stripe expires idempotency keys after 24 hours, so this protects against
 * near-simultaneous duplicates (retries, overlapping cron runs, a double
 * click) rather than forever. The durable guard is the stored refund_id,
 * checked in refundOrder before Stripe is contacted at all.
 */
export function refundIdempotencyKey(orderId: string): string {
  return `lerasa-order-refund-${orderId}`;
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
  // Already refunded once — never charge Stripe a second time. This is the
  // last line of defence behind the status guard: an order that carries a
  // refund_id has a completed refund on record, so we report that one.
  const existingRefund = (order.refund_id ?? "").trim();
  if (existingRefund) {
    return { refundId: existingRefund };
  }

  const pi = (order.stripe_payment_intent ?? "").trim();
  if (!pi) {
    return {
      error:
        "No Stripe payment reference on this order — refund it manually in the Stripe dashboard.",
    };
  }
  try {
    const { stripe } = await getStripe(supabase);
    // Idempotency key derived from the order id — see refundIdempotencyKey.
    // Two callers racing on the same order get the SAME refund back, not two.
    const refund = await stripe.refunds.create(
      { payment_intent: pi },
      { idempotencyKey: refundIdempotencyKey(String(order.id)) },
    );
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
 * `by` records who triggered it: 'customer' or 'auto' (the auto-cancel sweep).
 *
 * Order of operations chosen so the order is NEVER left in a bad state:
 *   1. issue the Stripe refund (best-effort)
 *   2. persist status=cancelled + the payment/refund outcome
 *   3. notify (best-effort; never blocks the result)
 *
 * If step 1 fails, payment_status is 'refund_pending' and the error is
 * stored for the admin to retry — the order is still safely Cancelled.
 */
export type CancelOptions = {
  /**
   * Atomically claim the order before doing anything irreversible: the status
   * is flipped to 'cancelled' with a `WHERE status = <onlyIfStatus>` guard, and
   * the whole operation is abandoned (returns null) if no row matched — meaning
   * someone else already moved it (admin accepted, customer cancelled, or a
   * duplicate sweep got there first). Postgres serialises the conditional
   * UPDATE, so exactly one caller can ever win the claim and issue the refund.
   */
  onlyIfStatus?: string;
  /**
   * The caller ALREADY claimed this order transactionally — the cron sweep,
   * via claimAutoCancellableOrders — so skip the claim step and go straight to
   * the refund. Set this only when the order row you hold came back from a
   * claim that flipped it to 'cancelled'; setting it otherwise removes the
   * double-refund guard.
   */
  alreadyClaimed?: boolean;
};

/**
 * Atomically claim a batch of orders due for auto-cancellation: pending,
 * paid, never refunded, and older than `cutoffIso`.
 *
 * Delegates to the auto_cancel_claim_orders function (39 migration), which
 * does the SELECT ... FOR UPDATE SKIP LOCKED and the UPDATE in ONE statement
 * inside ONE transaction. Claimed rows come back already marked 'cancelled',
 * so the caller owns them exclusively and can refund without racing anyone.
 *
 * Returns `null` — NOT an empty array — when the function isn't installed
 * yet, so the caller can distinguish "nothing to do" from "fall back to the
 * per-order claim path". Never throws.
 */
export async function claimAutoCancellableOrders(
  supabase: SupabaseClient,
  cutoffIso: string,
  limit: number,
): Promise<LifecycleOrderRow[] | null> {
  const { data, error } = await supabase.rpc("auto_cancel_claim_orders", {
    p_cutoff: cutoffIso,
    p_limit: limit,
  });

  if (error) {
    if (isMissingFunction(error)) return null;
    console.error("[order-lifecycle] claim batch failed:", error.message);
    return [];
  }
  return (data ?? []) as LifecycleOrderRow[];
}

/**
 * Write the refund outcome — payment status, refund id, error and timestamp —
 * as ONE transactional statement via auto_cancel_finalize (39 migration).
 *
 * Falls back to the plain UPDATE path when the function isn't installed, and
 * degrades again to the single `status` column on a pre-27 database, so the
 * order is always at least marked Cancelled. Returns true when the outcome
 * was persisted.
 */
async function persistCancellation(
  supabase: SupabaseClient,
  order: LifecycleOrderRow,
  by: "customer" | "auto" | "admin",
  refund: { refundId: string } | { error: string },
  paymentStatus: "refunded" | "refund_pending",
  nowIso: string,
): Promise<boolean> {
  const ok = "refundId" in refund;

  // Preferred: one statement, one transaction.
  const { error: rpcErr } = await supabase.rpc("auto_cancel_finalize", {
    p_order_id: String(order.id),
    p_refund_id: ok ? refund.refundId : null,
    p_refund_error: ok ? null : refund.error,
  });
  if (!rpcErr) return true;
  if (!isMissingFunction(rpcErr)) {
    console.error("[order-lifecycle] finalize failed:", rpcErr.message);
    return false;
  }

  // Fallback: full column set, degrading to core columns on a pre-27 database.
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
    return false;
  }
  return true;
}

// Callers that don't pass a guard always get a result (existing behaviour);
// guarded callers must handle the "someone else got there first" null.
export async function cancelAndRefund(
  supabase: SupabaseClient,
  order: LifecycleOrderRow,
  by: "customer" | "auto" | "admin",
): Promise<CancelResult>;
// The caller already owns the row, so there is no claim to lose: always a result.
export async function cancelAndRefund(
  supabase: SupabaseClient,
  order: LifecycleOrderRow,
  by: "customer" | "auto" | "admin",
  opts: CancelOptions & { alreadyClaimed: true },
): Promise<CancelResult>;
export async function cancelAndRefund(
  supabase: SupabaseClient,
  order: LifecycleOrderRow,
  by: "customer" | "auto" | "admin",
  opts: CancelOptions & { onlyIfStatus: string },
): Promise<CancelResult | null>;
export async function cancelAndRefund(
  supabase: SupabaseClient,
  order: LifecycleOrderRow,
  by: "customer" | "auto" | "admin",
  opts: CancelOptions = {},
): Promise<CancelResult | null> {
  const nowIso = new Date().toISOString();

  // 0) Optional atomic claim — see CancelOptions.onlyIfStatus. Runs BEFORE the
  //    refund so a losing racer never reaches Stripe. Skipped entirely when
  //    the caller already claimed the row transactionally (the cron sweep,
  //    via claimAutoCancellableOrders) — re-claiming would find status
  //    'cancelled', not 'pending', and wrongly abandon an order we own.
  if (opts.onlyIfStatus && !opts.alreadyClaimed) {
    // payment_status goes to 'refund_pending' — "cancelled, money owed back" —
    // BEFORE the refund is attempted. If this process dies between the claim
    // and Stripe, the order is no longer 'pending' so no sweep will retry it,
    // but it now sits exactly where the admin refund-retry tool looks instead
    // of silently keeping the customer's money. Step 2 promotes it to
    // 'refunded' once Stripe confirms.
    const claim = {
      status: "cancelled",
      payment_status: "refund_pending",
      cancelled_at: nowIso,
      cancelled_by: by,
      updated_at: nowIso,
    };
    let { data: claimed, error: claimErr } = await supabase
      .from("orders")
      .update(claim)
      .eq("id", order.id)
      .eq("status", opts.onlyIfStatus)
      .select("id");

    // Pre-27 database: retry the claim with the one column that always exists.
    if (claimErr && isMissingColumn(claimErr)) {
      ({ data: claimed, error: claimErr } = await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", order.id)
        .eq("status", opts.onlyIfStatus)
        .select("id"));
    }

    if (claimErr) {
      console.error("[order-lifecycle] claim failed:", claimErr.message);
      return null;
    }
    // No row matched — the order left `onlyIfStatus` between the read and now.
    if (!claimed || claimed.length === 0) return null;
  }

  // 1) Refund (best-effort).
  const refund = await refundOrder(supabase, order);
  const ok = "refundId" in refund;
  const paymentStatus: "refunded" | "refund_pending" = ok ? "refunded" : "refund_pending";

  // 2) Persist the outcome in one transaction (auto_cancel_finalize), with
  //    graceful fallbacks for databases that predate the 39/27 migrations.
  await persistCancellation(supabase, order, by, refund, paymentStatus, nowIso);

  // 3) Notify (best-effort — never throws, never blocks the result).
  //    The customer gets the refund email + the owner a WhatsApp via
  //    notifyLifecycle; the owner also gets an instant ntfy push. Sent
  //    together so every cancellation path — customer, sweep, admin — tells
  //    both parties the same thing.
  const orderNumber = orderNumberOf(order.id);
  const total = Number(order.total ?? order.amount ?? 0);
  try {
    await Promise.all([
      notifyLifecycle(supabase, by === "auto" ? "auto_cancelled" : "cancelled", {
        orderNumber,
        customerName: order.customer_name ?? "",
        email: order.email ?? "",
        total,
        refundState: paymentStatus,
      }),
      sendRefundNotification({
        orderNumber,
        customerName: order.customer_name ?? "",
        orderTotal: total,
        by,
        refundState: paymentStatus,
        refundError: ok ? undefined : refund.error,
      }),
    ]);
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
