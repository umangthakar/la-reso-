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

// ============================================================
// OFFER DISCOUNTS  (pure — no imports, client + server safe)
// The AUTHORITATIVE discount on a charge is computed server-side in the
// checkout route from offer rows read fresh from the DB. The client may use
// the same helpers for DISPLAY, but never sends a discount amount to trust.
// ============================================================

/** How an offer's `discount_value` is interpreted. */
export type DiscountType = "percentage" | "fixed";

/**
 * The shape of an offer this module needs. Mirrors the `offers` table columns
 * (see supabase/sql/15_offers.sql) but stays structural so both the raw DB row
 * and a typed model satisfy it. All fields optional so partial rows are safe.
 */
export type OfferLike = {
  discount_type?: DiscountType | string | null;
  discount_value?: number | string | null;
  min_subtotal?: number | string | null;
  active?: boolean | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

/**
 * Discount (in £) a SINGLE offer applies to `subtotal`, or 0 if it doesn't
 * qualify: inactive, subtotal below `min_subtotal`, or outside the
 * starts_at/ends_at window at `nowMs`. The result is clamped to [0, subtotal]
 * so an over-large fixed offer can never push the basket below £0.
 */
export function offerDiscountFor(
  subtotal: number,
  offer: OfferLike | null | undefined,
  nowMs: number = Date.now(),
): number {
  if (!offer || subtotal <= 0) return 0;
  if (offer.active === false) return 0;

  const min = Number(offer.min_subtotal) || 0;
  if (subtotal < min) return 0;

  if (offer.starts_at) {
    const start = Date.parse(offer.starts_at);
    if (!Number.isNaN(start) && nowMs < start) return 0;
  }
  if (offer.ends_at) {
    const end = Date.parse(offer.ends_at);
    if (!Number.isNaN(end) && nowMs > end) return 0;
  }

  const value = Number(offer.discount_value) || 0;
  if (value <= 0) return 0;

  const raw =
    offer.discount_type === "fixed"
      ? value
      : subtotal * (value / 100);

  return round2(Math.min(Math.max(raw, 0), subtotal));
}

/**
 * The best (largest) discount across `offers` for a given subtotal, plus the
 * winning offer. Offers that don't qualify contribute 0. Returns amount 0 and
 * a null offer when nothing applies. Only ONE offer is ever applied — offers
 * do not stack.
 */
export function bestOfferDiscount<T extends OfferLike>(
  subtotal: number,
  offers: T[] | null | undefined,
  nowMs: number = Date.now(),
): { offer: T | null; amount: number } {
  let best: { offer: T | null; amount: number } = { offer: null, amount: 0 };
  if (!Array.isArray(offers)) return best;
  for (const offer of offers) {
    const amount = offerDiscountFor(subtotal, offer, nowMs);
    if (amount > best.amount) best = { offer, amount };
  }
  return best;
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
