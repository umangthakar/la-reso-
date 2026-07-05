// ============================================================
// Le Rasa Bakery — shared pricing rules (client + server safe)
// No imports / side effects, so it can be used in the cart context,
// the checkout UI, and the Stripe API routes alike.
// ============================================================

/** Flat delivery fee applied to any paid basket below the free threshold. */
export const DELIVERY_FEE = 4.99;

/** Baskets at or above this subtotal ship free. */
export const FREE_DELIVERY_THRESHOLD = 50;

/** Delivery fee for a given subtotal. Empty basket ships for £0. */
export function deliveryFeeFor(subtotal: number): number {
  if (subtotal <= 0) return 0;
  return subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
}

/** Round to 2dp to avoid floating-point drift in money maths. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Format a number as GBP, e.g. 4.5 -> "£4.50". */
export function money(n: number): string {
  return `£${round2(n).toFixed(2)}`;
}

/** Convert pounds to integer pence for Stripe. */
export function toPence(pounds: number): number {
  return Math.round(round2(pounds) * 100);
}
