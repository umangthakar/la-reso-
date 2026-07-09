// ============================================================
// Le Rasa Bakery — shared OFFER engine (client + server safe)
// ------------------------------------------------------------
// The SINGLE place discount logic lives. The client uses these helpers for
// cart / PDP price PREVIEW; the server uses the exact same helpers in the
// checkout route to compute the AUTHORITATIVE charge — so the numbers can
// never drift between what a customer is shown and what they're charged.
//
// Pure by contract: no network calls, no Supabase import, no React import,
// no module-level side effects — exactly like lib/pricing.ts. The only
// dependency is round2()/money() from lib/pricing.ts (shared money math),
// so this file stays fully unit-testable and identical on both runtimes.
//
// Schema mirrored here is the Phase 1 `offers` row plus its resolved
// offer_category_rules / offer_product_rules (and offer_emails) — see
// supabase/sql/15_offers.sql and the migration's eligibility comment.
// ============================================================

import { round2, money } from "./pricing";

// ------------------------------------------------------------
// Enum-like unions (mirror the DB check constraints)
// ------------------------------------------------------------
export type OfferType =
  | "percentage"
  | "fixed_amount"
  | "buy_x_get_y"
  | "free_delivery"
  | "coupon"
  | "custom";

export type CouponDiscountType = "percentage" | "fixed_amount";
export type EligibilityScope = "all" | "categories" | "products";
export type OfferAudience =
  | "everyone"
  | "first_order"
  | "new_customer"
  | "specific_emails";
export type RuleMode = "include" | "exclude";

/** A numeric column: Supabase returns `numeric` as a string, so tolerate both. */
type Numeric = number | string | null | undefined;

// ------------------------------------------------------------
// Resolved child-table rows attached to an Offer
// ------------------------------------------------------------
export type OfferCategoryRule = { category: string; mode: RuleMode };
export type OfferProductRule = { product_id: string; mode: RuleMode };

/**
 * The offer shape this engine needs. Mirrors the `offers` table columns from
 * Phase 1 (supabase/sql/15_offers.sql) plus the resolved category / product
 * rule arrays and the specific-emails allowlist. Numeric fields tolerate the
 * string form Postgres `numeric` comes back as; every field a raw DB row may
 * omit is optional so both a raw row and a typed model satisfy it.
 */
export type Offer = {
  id: string;
  name: string;
  type: OfferType;
  enabled: boolean;
  stackable: boolean;
  priority: number;

  // discount values (which ones matter depends on `type`)
  percentage_value?: Numeric;
  fixed_amount_value?: Numeric;
  buy_x_quantity?: Numeric;
  get_y_quantity?: Numeric;
  get_y_discount_percent?: Numeric; // 100 = the Y item is free
  free_delivery?: boolean | null; // can combine with ANY type
  coupon_code?: string | null;
  coupon_discount_type?: CouponDiscountType | null;

  // eligibility
  eligibility_scope: EligibilityScope;

  // cart conditions
  min_order_amount?: Numeric;
  max_order_amount?: Numeric;
  min_quantity?: Numeric;
  max_quantity?: Numeric;

  // audience
  audience: OfferAudience;
  usage_limit_total?: Numeric;
  usage_limit_per_customer?: Numeric;

  // schedule
  start_at?: string | null;
  end_at?: string | null;
  time_start?: string | null; // 'HH:MM[:SS]' daily window
  time_end?: string | null;
  days_of_week?: number[] | null; // 0=Sun..6=Sat; null/empty = every day

  // storefront content (not used by the math; carried for banner rendering)
  announcement_text?: string | null;
  hero_heading?: string | null;
  hero_subtext?: string | null;
  hero_highlight_text?: string | null;
  cta_text?: string | null;
  cta_link?: string | null;
  banner_image_url?: string | null;

  created_at: string;
  updated_at?: string;

  // resolved child rows
  categoryRules: OfferCategoryRule[];
  productRules: OfferProductRule[];
  emails?: string[]; // resolved offer_emails, for audience='specific_emails'
};

/** Minimal product shape needed to decide eligibility. */
export type EligibleProduct = { id: string; category?: string | null };

/** A cart line the discount math runs over. `id` is the product id. */
export type OfferCartItem = {
  id: string;
  category?: string | null;
  price: Numeric;
  quantity: Numeric;
};

export type OfferDiscount = {
  discountAmount: number;
  freeDelivery: boolean;
  appliedItemIds: string[];
};

export type ConditionResult = { ok: boolean; reason?: string };

// ============================================================
// Internal coercion helpers (keep runtime robust against string numerics)
// ============================================================

/** Coerce anything to a finite number, defaulting to 0. */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** True when a nullable numeric column actually carries a value (a limit is set). */
function hasNum(v: Numeric): v is number | string {
  return v !== null && v !== undefined && String(v).trim() !== "";
}

/** Parse a Postgres `time` ('HH:MM[:SS]') to seconds-since-midnight, or null. */
function timeToSeconds(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(t).trim());
  if (!m) return null;
  return num(m[1]) * 3600 + num(m[2]) * 60 + num(m[3]);
}

/** A percentage discount off `base`, clamped to [0, base] and rounded. */
function percentOf(base: number, pct: Numeric): number {
  const p = Math.max(0, num(pct));
  return round2(Math.min(base * (p / 100), base));
}

/** A fixed £ discount, clamped to [0, base] (can't exceed the eligible subtotal). */
function fixedOff(base: number, amount: Numeric): number {
  return round2(Math.min(Math.max(num(amount), 0), base));
}

// ============================================================
// SCHEDULE — "active right now" is DERIVED, never stored
// ============================================================

/**
 * Whether `offer` is active at `now`: enabled AND inside its date window
 * (start_at/end_at) AND inside its daily time window (time_start/time_end)
 * AND today is one of days_of_week. Every schedule field is optional — an
 * absent field means "no restriction on that axis".
 *
 * IMPORTANT (do not "fix" this with a cron job): there is deliberately NO
 * stored status column that a scheduler flips on/off. An offer's live
 * active-ness is ALWAYS computed from `enabled` + its schedule at read time,
 * here. That's the entire mechanism behind "offers automatically activate
 * and deactivate on schedule" — adding a cron to mutate a status column
 * would introduce a second, drift-prone source of truth. Leave it derived.
 *
 * Time-of-day and day-of-week are evaluated against the runtime's LOCAL
 * clock (the site serves a single UK timezone); date window uses absolute
 * instants, so it's timezone-agnostic.
 */
export function isOfferCurrentlyActive(offer: Offer, now: Date): boolean {
  if (!offer || !offer.enabled) return false;

  const t = now.getTime();

  if (offer.start_at) {
    const start = Date.parse(offer.start_at);
    if (!Number.isNaN(start) && t < start) return false;
  }
  if (offer.end_at) {
    const end = Date.parse(offer.end_at);
    if (!Number.isNaN(end) && t > end) return false;
  }

  // Daily time-of-day window (supports overnight ranges e.g. 22:00–02:00).
  const startS = timeToSeconds(offer.time_start);
  const endS = timeToSeconds(offer.time_end);
  if (startS !== null || endS !== null) {
    const cur =
      now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    if (startS !== null && endS !== null) {
      const inWindow =
        startS <= endS
          ? cur >= startS && cur <= endS
          : cur >= startS || cur <= endS; // overnight
      if (!inWindow) return false;
    } else if (startS !== null) {
      if (cur < startS) return false;
    } else if (endS !== null) {
      if (cur > endS) return false;
    }
  }

  // Days of week (0=Sun..6=Sat); null/empty = every day.
  if (Array.isArray(offer.days_of_week) && offer.days_of_week.length > 0) {
    if (!offer.days_of_week.includes(now.getDay())) return false;
  }

  return true;
}

// ============================================================
// ELIGIBILITY — base-set-then-subtract-exclusions
// (mirrors the algorithm documented in supabase/sql/15_offers.sql)
// ============================================================

function includeCategories(offer: Offer): Set<string> {
  return new Set(
    offer.categoryRules
      .filter((r) => r.mode === "include")
      .map((r) => r.category),
  );
}
function excludeCategories(offer: Offer): Set<string> {
  return new Set(
    offer.categoryRules
      .filter((r) => r.mode === "exclude")
      .map((r) => r.category),
  );
}
function includeProductIds(offer: Offer): Set<string> {
  return new Set(
    offer.productRules
      .filter((r) => r.mode === "include")
      .map((r) => r.product_id),
  );
}
function excludeProductIds(offer: Offer): Set<string> {
  return new Set(
    offer.productRules
      .filter((r) => r.mode === "exclude")
      .map((r) => r.product_id),
  );
}

/**
 * Whether a single product is in the offer's eligible set.
 *   base:
 *     scope='all'        -> every product
 *     scope='categories' -> product.category ∈ include-categories
 *     scope='products'   -> product.id ∈ include-products
 *   then, regardless of scope, REMOVE the product if it is in an exclude
 *   product rule OR its category is in an exclude category rule.
 */
export function isProductEligible(offer: Offer, product: EligibleProduct): boolean {
  if (!offer || !product) return false;
  const category = product.category ?? "";

  let base: boolean;
  switch (offer.eligibility_scope) {
    case "categories":
      base = includeCategories(offer).has(category);
      break;
    case "products":
      base = includeProductIds(offer).has(product.id);
      break;
    case "all":
    default:
      base = true;
      break;
  }
  if (!base) return false;

  if (excludeProductIds(offer).has(product.id)) return false;
  if (category && excludeCategories(offer).has(category)) return false;

  return true;
}

/** The set of eligible product ids across `allProducts` for this offer. */
export function resolveEligibleProductIds(
  offer: Offer,
  allProducts: EligibleProduct[],
): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(allProducts)) return out;
  for (const p of allProducts) {
    if (isProductEligible(offer, p)) out.add(p.id);
  }
  return out;
}

// ============================================================
// DISCOUNT MATH — per type. Every money value goes through round2().
// ============================================================

/**
 * The discount a SINGLE offer applies to a cart. `cartSubtotal` is the
 * authoritative (server-computed) subtotal used as the final clamp so the
 * discount can never exceed the basket. This does NOT check schedule,
 * conditions, or audience — callers gate with isOfferCurrentlyActive /
 * checkCartConditions / checkAudienceEligibility first.
 */
export function computeOfferDiscount(
  offer: Offer,
  cartItems: OfferCartItem[],
  cartSubtotal: number,
): OfferDiscount {
  // free_delivery is a flag that rides on ANY type, plus it's the whole point
  // of the free_delivery type — either path turns it on.
  const freeDelivery = offer?.type === "free_delivery" || !!offer?.free_delivery;
  const empty: OfferDiscount = {
    discountAmount: 0,
    freeDelivery,
    appliedItemIds: [],
  };
  if (!offer || !Array.isArray(cartItems) || cartItems.length === 0) return empty;

  const eligible = cartItems.filter((i) => isProductEligible(offer, i));
  if (eligible.length === 0) return empty;

  const eligibleIds = Array.from(new Set(eligible.map((i) => i.id)));
  const eligibleSubtotal = round2(
    eligible.reduce((s, i) => s + num(i.price) * num(i.quantity), 0),
  );

  let discountAmount = 0;
  let appliedItemIds: string[] = [];

  switch (offer.type) {
    case "percentage": {
      discountAmount = percentOf(eligibleSubtotal, offer.percentage_value);
      appliedItemIds = eligibleIds;
      break;
    }
    case "fixed_amount": {
      discountAmount = fixedOff(eligibleSubtotal, offer.fixed_amount_value);
      appliedItemIds = eligibleIds;
      break;
    }
    case "coupon": {
      discountAmount =
        offer.coupon_discount_type === "fixed_amount"
          ? fixedOff(eligibleSubtotal, offer.fixed_amount_value)
          : percentOf(eligibleSubtotal, offer.percentage_value);
      appliedItemIds = eligibleIds;
      break;
    }
    case "buy_x_get_y": {
      const res = buyXGetY(offer, eligible);
      discountAmount = res.discountAmount;
      appliedItemIds = res.appliedItemIds;
      break;
    }
    case "free_delivery":
    case "custom":
    default:
      // No line-item discount (free_delivery handled via the flag above;
      // 'custom' carries no automatic math).
      discountAmount = 0;
      appliedItemIds = [];
      break;
  }

  // Final safety clamp: never discount more than the whole basket.
  discountAmount = round2(Math.min(Math.max(discountAmount, 0), cartSubtotal));
  if (discountAmount <= 0) appliedItemIds = [];

  return { discountAmount, freeDelivery, appliedItemIds };
}

/**
 * Buy-X-get-Y: expand eligible lines into individual units, and for every
 * complete group of (X + Y) units, discount the Y CHEAPEST units in the group
 * at get_y_discount_percent (100% = free). We sort all units ascending and
 * discount the cheapest `sets * Y` of them — the customer-friendly reading of
 * "buy X get Y" where the discounted items are the cheapest qualifying ones.
 */
function buyXGetY(
  offer: Offer,
  eligible: OfferCartItem[],
): { discountAmount: number; appliedItemIds: string[] } {
  const x = Math.floor(num(offer.buy_x_quantity));
  const y = Math.floor(num(offer.get_y_quantity));
  const pct = num(offer.get_y_discount_percent);
  if (x <= 0 || y <= 0 || pct <= 0) {
    return { discountAmount: 0, appliedItemIds: [] };
  }

  // One entry per physical unit, carrying its price and source line id.
  const units: { id: string; price: number }[] = [];
  for (const item of eligible) {
    const qty = Math.floor(num(item.quantity));
    const price = num(item.price);
    for (let n = 0; n < qty; n++) units.push({ id: item.id, price });
  }

  const groupSize = x + y;
  const sets = Math.floor(units.length / groupSize);
  const freeUnits = sets * y;
  if (freeUnits <= 0) return { discountAmount: 0, appliedItemIds: [] };

  units.sort((a, b) => a.price - b.price); // cheapest first

  let discountAmount = 0;
  const applied = new Set<string>();
  for (let n = 0; n < freeUnits; n++) {
    const unit = units[n];
    discountAmount += unit.price * (pct / 100);
    applied.add(unit.id);
  }

  return {
    discountAmount: round2(discountAmount),
    appliedItemIds: Array.from(applied),
  };
}

// ============================================================
// CART CONDITIONS — min/max order amount & quantity
// ============================================================

export function checkCartConditions(
  offer: Offer,
  cartSubtotal: number,
  cartQuantity: number,
): ConditionResult {
  if (!offer) return { ok: true };

  if (hasNum(offer.min_order_amount) && cartSubtotal < num(offer.min_order_amount)) {
    return { ok: false, reason: `Minimum order is ${money(num(offer.min_order_amount))}` };
  }
  if (hasNum(offer.max_order_amount) && cartSubtotal > num(offer.max_order_amount)) {
    return { ok: false, reason: `Maximum order for this offer is ${money(num(offer.max_order_amount))}` };
  }
  if (hasNum(offer.min_quantity) && cartQuantity < num(offer.min_quantity)) {
    return { ok: false, reason: `Add at least ${num(offer.min_quantity)} item(s) to use this offer` };
  }
  if (hasNum(offer.max_quantity) && cartQuantity > num(offer.max_quantity)) {
    return { ok: false, reason: `This offer applies to at most ${num(offer.max_quantity)} item(s)` };
  }

  return { ok: true };
}

// ============================================================
// AUDIENCE — pure rule application only.
// The "is this actually their first order / a new customer" facts require a
// DB query and are resolved SERVER-SIDE, then passed in as booleans. This
// function never touches the database, so it stays pure and testable.
// ============================================================

export function checkAudienceEligibility(
  offer: Offer,
  context: { email?: string; isFirstOrder?: boolean; isNewCustomer?: boolean },
): ConditionResult {
  if (!offer) return { ok: true };

  switch (offer.audience) {
    case "first_order":
      return context.isFirstOrder
        ? { ok: true }
        : { ok: false, reason: "This offer is for first orders only" };

    case "new_customer":
      return context.isNewCustomer
        ? { ok: true }
        : { ok: false, reason: "This offer is for new customers only" };

    case "specific_emails": {
      const email = (context.email ?? "").trim().toLowerCase();
      const allow = (offer.emails ?? []).map((e) => e.trim().toLowerCase());
      return email && allow.includes(email)
        ? { ok: true }
        : { ok: false, reason: "This offer isn't available for your account" };
    }

    case "everyone":
    default:
      return { ok: true };
  }
}

// ============================================================
// RESOLUTION — which offer(s) apply right now
// ============================================================

/**
 * From a set of offers, resolve the ones active at `now` into:
 *  - primary:   the one non-stackable offer that drives the storefront banner
 *               and headline pricing. Should be at most one thanks to the
 *               Phase 1 exclusion constraint, but if two are somehow active we
 *               defend by picking highest `priority`, then most recent
 *               `created_at`.
 *  - stackable: every active stackable offer, which ALSO applies to pricing on
 *               top of the primary (they combine rather than compete).
 */
export function resolveActiveOffers(
  offers: Offer[],
  now: Date,
): { primary: Offer | null; stackable: Offer[] } {
  if (!Array.isArray(offers)) return { primary: null, stackable: [] };

  const active = offers.filter((o) => isOfferCurrentlyActive(o, now));
  const stackable = active.filter((o) => o.stackable);

  const nonStackable = active
    .filter((o) => !o.stackable)
    .sort((a, b) => {
      if (b.priority !== a.priority) return num(b.priority) - num(a.priority);
      const ca = Date.parse(a.created_at || "");
      const cb = Date.parse(b.created_at || "");
      return (Number.isNaN(cb) ? 0 : cb) - (Number.isNaN(ca) ? 0 : ca);
    });

  return { primary: nonStackable[0] ?? null, stackable };
}

/** The single winning "primary" offer active at `now`, or null. */
export function resolveActiveOffer(offers: Offer[], now: Date): Offer | null {
  return resolveActiveOffers(offers, now).primary;
}

// ============================================================
// PRODUCT PRICE VIEW  (the ONE shared piece for per-product display)
// ------------------------------------------------------------
// Given a product and the resolved active/stackable offers, returns what the
// storefront should render for that product's price. The card / PDP preview
// reflects PERCENTAGE offers only — those are inherently per-unit and
// condition-light. Fixed-amount, buy-X-get-Y and free-delivery are cart-level
// effects (they depend on the whole basket / conditions), so they don't strike
// through a single product's price; they apply in the cart drawer + checkout.
// ============================================================
export type ProductPriceView = {
  hasDiscount: boolean;
  originalPrice: number;
  discountedPrice: number;
  savedAmount: number;
  badgeText: string;
};

export function resolveProductPrice(
  product: { id: string; category?: string | null; price: Numeric },
  offers: { primary: Offer | null; stackable: Offer[] } | null | undefined,
): ProductPriceView {
  const originalPrice = round2(num(product.price));
  const empty: ProductPriceView = {
    hasDiscount: false,
    originalPrice,
    discountedPrice: originalPrice,
    savedAmount: 0,
    badgeText: "",
  };
  if (!offers || originalPrice <= 0) return empty;

  const applicable = [offers.primary, ...(offers.stackable ?? [])].filter(
    (o): o is Offer => !!o && isProductEligible(o, product),
  );
  if (applicable.length === 0) return empty;

  // Sum percentage offers the product is eligible for (mirrors the additive
  // stacking the checkout uses), capped at 100%.
  let pct = 0;
  for (const o of applicable) {
    if (o.type === "percentage") pct += Math.max(0, num(o.percentage_value));
  }
  pct = Math.min(pct, 100);
  if (pct <= 0) return empty;

  const discountedPrice = round2(originalPrice * (1 - pct / 100));
  const savedAmount = round2(originalPrice - discountedPrice);
  if (savedAmount <= 0) return empty;

  const pctLabel = Number.isInteger(pct) ? String(pct) : String(round2(pct));
  return { hasDiscount: true, originalPrice, discountedPrice, savedAmount, badgeText: `${pctLabel}% OFF` };
}

// ============================================================
// DB ROW → Offer  (pure parser; the ONE place a raw offers row + its embedded
// child rules is normalised into the Offer shape this engine consumes).
// Tolerates PostgREST embedding (`offer_category_rules`, `offer_product_rules`,
// `offer_emails`) OR already-resolved (`categoryRules`/`productRules`/`emails`)
// arrays, so admin/service reads and public/anon reads both feed it.
// ============================================================
export function offerFromRow(row: Record<string, unknown>): Offer {
  const r = row ?? {};
  const asNum = (v: unknown): Numeric => (v === null || v === undefined ? null : (v as number | string));
  const asStr = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

  const catSrc = (Array.isArray(r.offer_category_rules)
    ? r.offer_category_rules
    : Array.isArray(r.categoryRules)
      ? r.categoryRules
      : []) as Record<string, unknown>[];
  const prodSrc = (Array.isArray(r.offer_product_rules)
    ? r.offer_product_rules
    : Array.isArray(r.productRules)
      ? r.productRules
      : []) as Record<string, unknown>[];
  const emailSrc = (Array.isArray(r.offer_emails)
    ? r.offer_emails
    : Array.isArray(r.emails)
      ? r.emails
      : []) as unknown[];

  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    type: (r.type ?? "custom") as OfferType,
    enabled: r.enabled === true,
    stackable: r.stackable === true,
    priority: num(r.priority),
    percentage_value: asNum(r.percentage_value),
    fixed_amount_value: asNum(r.fixed_amount_value),
    buy_x_quantity: asNum(r.buy_x_quantity),
    get_y_quantity: asNum(r.get_y_quantity),
    get_y_discount_percent: asNum(r.get_y_discount_percent),
    free_delivery: r.free_delivery === true,
    coupon_code: asStr(r.coupon_code),
    coupon_discount_type: (asStr(r.coupon_discount_type) as CouponDiscountType | null),
    eligibility_scope: (r.eligibility_scope ?? "all") as EligibilityScope,
    min_order_amount: asNum(r.min_order_amount),
    max_order_amount: asNum(r.max_order_amount),
    min_quantity: asNum(r.min_quantity),
    max_quantity: asNum(r.max_quantity),
    audience: (r.audience ?? "everyone") as OfferAudience,
    usage_limit_total: asNum(r.usage_limit_total),
    usage_limit_per_customer: asNum(r.usage_limit_per_customer),
    start_at: asStr(r.start_at),
    end_at: asStr(r.end_at),
    time_start: asStr(r.time_start),
    time_end: asStr(r.time_end),
    days_of_week: Array.isArray(r.days_of_week) ? (r.days_of_week as unknown[]).map(num) : null,
    announcement_text: asStr(r.announcement_text),
    hero_heading: asStr(r.hero_heading),
    hero_subtext: asStr(r.hero_subtext),
    hero_highlight_text: asStr(r.hero_highlight_text),
    cta_text: asStr(r.cta_text),
    cta_link: asStr(r.cta_link),
    banner_image_url: asStr(r.banner_image_url),
    created_at: String(r.created_at ?? ""),
    updated_at: asStr(r.updated_at) ?? undefined,
    categoryRules: catSrc.map((c) => ({
      category: String(c.category ?? ""),
      mode: c.mode === "exclude" ? "exclude" : "include",
    })),
    productRules: prodSrc.map((p) => ({
      product_id: String(p.product_id ?? ""),
      mode: p.mode === "exclude" ? "exclude" : "include",
    })),
    emails: emailSrc
      .map((e) => (typeof e === "string" ? e : String((e as Record<string, unknown>)?.email ?? "")))
      .filter(Boolean),
  };
}
