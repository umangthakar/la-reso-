// ============================================================
// Le Rasa Bakery — shared pricing rules (client + server safe)
// No imports / side effects, so it can be used in the cart context,
// the checkout UI, and the Stripe API routes alike.
// ============================================================

/**
 * Fallback delivery fee, used only when no admin-configured zone matches the
 * postcode. A matching zone's fee always wins — see resolveDeliveryFee.
 */
export const DELIVERY_FEE = 4.99;

/**
 * Delivery fee before a postcode is known (i.e. the cart drawer). Empty
 * basket ships for £0; anything else pays. The basket total never earns free
 * delivery — the real, postcode-derived fee is applied at checkout by
 * resolveDeliveryFee.
 */
export function deliveryFeeFor(subtotal: number): number {
  if (subtotal <= 0) return 0;
  return DELIVERY_FEE;
}

type ZoneLike = { postcode_prefix?: string; fee?: number };

/**
 * Normalise a postcode for comparison: uppercase, all whitespace removed.
 * "ha2 0wr", "HA2 0WR" and "HA20WR" all normalise to "HA20WR". Used for both
 * the customer input and the stored zone prefixes so matching is case- and
 * space-insensitive on both sides.
 */
export function normalizePostcode(pc: string | undefined | null): string {
  return String(pc ?? "").toUpperCase().replace(/\s+/g, "");
}

/**
 * The OUTWARD code of a postcode (the part delivery zones match on), normalised.
 * A UK inward code is always one digit followed by two letters, so when the
 * input carries a full postcode we strip that trailing block; a value that is
 * already just an outward code (e.g. "HA2") is returned unchanged.
 *
 *   "HA2 0WR" -> "HA2"   "WD17 8XX" -> "WD17"   "E3 1AA" -> "E3"   "HA2" -> "HA2"
 */
export function extractOutwardCode(pc: string | undefined | null): string {
  const norm = normalizePostcode(pc);
  if (norm.length > 3 && /[0-9][A-Z]{2}$/.test(norm)) return norm.slice(0, -3);
  return norm;
}

/**
 * Delivery fee for an order, derived from the POSTCODE alone.
 *
 * The subtotal deliberately does not influence the fee: a £20 basket and a
 * £5,000 basket to the same postcode both pay that postcode's configured fee.
 * The only subtotal check is the empty-basket guard, which keeps a £0 order
 * at £0.
 *
 * The zones come from the admin delivery settings, so changing a zone's fee
 * in the panel immediately changes what checkout charges — nothing is
 * hardcoded here. The longest matching postcode prefix wins, so a specific
 * "HA2 0" zone beats a broader "HA". With no matching zone, DELIVERY_FEE is
 * the fallback (an unrecognised postcode must never ship free).
 *
 * NOTE: a free-delivery OFFER can still waive the fee. That is an explicit
 * admin/coupon decision handled by the callers, not the automatic
 * spend-enough-and-it's-free rule that used to live here.
 */
export function resolveDeliveryFee(
  subtotal: number,
  postcode: string | undefined,
  zones: ZoneLike[] | undefined,
): number {
  if (subtotal <= 0) return 0;

  // Normalise both sides and work from the OUTWARD code so a full postcode
  // ("HA2 0WR"), its spaced/lowercase variants, and a bare outward code
  // ("HA2") all match the stored prefix ("HA2"). Longest prefix wins.
  const pc = normalizePostcode(postcode);
  const outward = extractOutwardCode(postcode);
  if (Array.isArray(zones) && zones.length > 0 && pc) {
    let best: { fee: number; len: number; prefix: string } | null = null;
    for (const z of zones) {
      const prefix = normalizePostcode(z?.postcode_prefix);
      if (prefix && (outward.startsWith(prefix) || pc.startsWith(prefix))) {
        const fee = Number(z?.fee) || 0;
        if (!best || prefix.length > best.len) best = { fee, len: prefix.length, prefix };
      }
    }
    // [debug] TEMPORARY — remove once postcode matching is confirmed.
    console.log("[delivery] match", {
      customerPostcode: postcode,
      normalized: pc,
      outwardCode: outward,
      matchedPrefix: best?.prefix ?? null,
      appliedFee: best ? round2(best.fee) : DELIVERY_FEE,
      reason: best ? "zone matched" : "no zone prefix matched → fallback fee",
    });
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
