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

type ZoneLike = { postcode_prefix?: string; fee?: number };

/**
 * Delivery fee taking admin-configured delivery zones into account.
 * Empty basket ships free; baskets over the free threshold ship free.
 * Otherwise, if any zone's postcode prefix matches (longest match wins),
 * that zone's fee applies; failing that, the flat DELIVERY_FEE is used.
 */
export function resolveDeliveryFee(
  subtotal: number,
  postcode: string | undefined,
  zones: ZoneLike[] | undefined,
): number {
  if (subtotal <= 0) return 0;
  if (subtotal >= FREE_DELIVERY_THRESHOLD) return 0;

  const pc = (postcode ?? "").toUpperCase().replace(/\s+/g, "");
  if (Array.isArray(zones) && zones.length > 0 && pc) {
    let best: { fee: number; len: number } | null = null;
    for (const z of zones) {
      const prefix = String(z?.postcode_prefix ?? "")
        .toUpperCase()
        .replace(/\s+/g, "");
      if (prefix && pc.startsWith(prefix)) {
        const fee = Number(z?.fee) || 0;
        if (!best || prefix.length > best.len) best = { fee, len: prefix.length };
      }
    }
    if (best) return round2(best.fee);
  }

  return DELIVERY_FEE;
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
