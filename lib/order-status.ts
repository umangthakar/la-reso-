// ============================================================
// Le Rasa Bakery — order status vocabulary (single source of truth)
// ------------------------------------------------------------
// Before this module the same two questions were answered in three places,
// and they disagreed:
//
//   "which orders need action?"
//     /api/admin/stats     → pending, received, preparing, ready   (right)
//     /api/admin/dashboard → received, preparing                   (WRONG)
//
//   so the Dashboard's "Pending orders" tile read 0 while brand-new orders sat
//   unaccepted — and /api/cron/auto-cancel cancels and refunds those once they
//   pass the deadline (lib/order-timeout).
//
//   "what counts as revenue?"
//     every widget summed orders.total with NO status filter, so cancelled and
//     refunded orders inflated the figures the owner makes decisions on.
//
// PURE and isomorphic (no supabase, no server-only imports) so the API routes,
// the dashboard and the analytics page all read the SAME definitions.
// Presentation — labels, colours — deliberately stays in the pages.
// ============================================================

/** Every status an order can hold, in lifecycle order. Drives filter menus. */
export const ORDER_STATUSES = [
  "pending",
  "received",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * The fulfilment stages an ACCEPTED order advances through. Excludes 'pending'
 * (pre-acceptance) and 'cancelled' (terminal).
 */
export const FULFILMENT_ORDER = [
  "received",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
] as const;

/**
 * Orders that still need someone to do something:
 *   pending   — awaiting the owner's acceptance (auto-cancelled past the deadline)
 *   received  — accepted, not started
 *   preparing — in the kitchen
 *   ready     — baked, awaiting dispatch
 *
 * This is what the Dashboard's "Pending orders" tile counts.
 */
export const ACTIONABLE_STATUSES: readonly string[] = [
  "pending",
  "received",
  "preparing",
  "ready",
];

/** Statuses that mean no money was ultimately kept. */
export const NON_REVENUE_STATUSES: readonly string[] = ["cancelled", "refunded"];

/** Payment states that mean no money was ultimately kept. */
export const NON_REVENUE_PAYMENT_STATUSES: readonly string[] = [
  "refunded",
  "refund_pending",
  "failed",
];

/** Lower-case a status defensively (the DB stores lowercase; labels don't). */
function norm(v: unknown): string {
  return String(v ?? "").toLowerCase().trim();
}

/** True when this order still needs action from the bakery. */
export function isActionableStatus(status: unknown): boolean {
  return ACTIONABLE_STATUSES.includes(norm(status));
}

/**
 * True when an order's money should be counted as revenue.
 *
 * Excludes cancelled orders and anything refunded / refund-pending / failed.
 * `payment_status` is checked separately from `status` because a cancelled
 * order can carry 'refunded' while the fulfilment status stays 'cancelled' —
 * and a delivered order can still have been refunded afterwards.
 *
 * Databases predating the payment_status column pass `undefined`, which is
 * treated as paid — the previous behaviour for those rows.
 */
export function countsAsRevenue(status: unknown, paymentStatus?: unknown): boolean {
  if (NON_REVENUE_STATUSES.includes(norm(status))) return false;
  const pay = norm(paymentStatus);
  if (pay && NON_REVENUE_PAYMENT_STATUSES.includes(pay)) return false;
  return true;
}

/** Sum `total` across only the orders that count as revenue. */
export function sumRevenue(
  orders: { total?: unknown; amount?: unknown; status?: unknown; payment_status?: unknown }[],
): number {
  let sum = 0;
  for (const o of orders) {
    if (!countsAsRevenue(o.status, o.payment_status)) continue;
    const value = Number(o.total ?? o.amount ?? 0);
    if (Number.isFinite(value)) sum += value;
  }
  return Math.round(sum * 100) / 100;
}
