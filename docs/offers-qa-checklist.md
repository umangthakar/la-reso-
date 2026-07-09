# Offer System — Manual QA Checklist

Run this end-to-end **after** the Phase-1 offers schema is applied to Supabase
(see the ⚠️ blocker at the bottom — as of this writing the `offers` tables do
**not** exist in the live database, so none of the checks below can pass yet).

Legend: ▢ = to verify · each step notes the surface(s) that must agree.

---

## 1. Create each of the 6 offer types end-to-end

For each type: **Admin → Offers → New Offer**, fill the type-specific fields,
enable it, save, then load the storefront and confirm the effect.

- ▢ **percentage** — e.g. 20% off All products. Product cards + PDP show a
  strikethrough original + discounted price + `20% OFF` badge; cart drawer
  subtotal drops 20%; checkout summary shows a Discount line; Stripe amount =
  discounted total.
- ▢ **fixed_amount** — e.g. £5 off (min order £30). No per-card strikethrough
  (cart-level), but cart drawer + checkout show −£5 once the basket qualifies.
- ▢ **buy_x_get_y** — e.g. Buy 2 Get 1 free on a category. Add 3 eligible items;
  cart/checkout discount the cheapest qualifying unit at the configured %.
- ▢ **free_delivery** — delivery fee shows **Free** in cart drawer + checkout;
  Stripe amount excludes delivery.
- ▢ **coupon** — create with a code + coupon_discount_type. Not auto-applied;
  entering the code on checkout (below) applies it.
- ▢ **custom** — no automatic discount; only the free-delivery toggle and/or the
  storefront banner content take effect.

Storefront content per offer (any type): setting `announcement_text`,
`hero_heading/subtext`, `hero_highlight_text`, `cta_*` updates the announcement
bar, the Special-Offer banner heading/CTA, and the banner watermark **live**
(no page redeploy), and reverts when the offer is disabled/expires.

## 2. DB exclusion constraint (only one active non-stackable offer)

- ▢ Create offer A: non-stackable, enabled, open-ended (or an overlapping
  window). Create offer B: non-stackable, enabled, overlapping window.
- ▢ Saving B must return the **friendly 409** "Another non-stackable offer is
  already active in this window." from `POST/PUT /api/admin/offers` — **not** a
  raw Postgres `23P01` error string. (Toggling B to enabled via the list PATCH
  must 409 the same way and the list toggle should visually revert.)
- ▢ Making either A or B **stackable** (or disabling one) lets both save.

## 3. Coupon offers are not anon-enumerable, but resolve via validate_coupon()

- ▢ With a coupon-type offer present, a plain anon `select * from offers` (and
  `GET /api/offers/active`) must **never** include the coupon row.
- ▢ `POST /api/offers/validate-coupon` with the **correct** code returns a
  discount preview; with a **wrong** code returns `{ valid:false }` with a
  generic "not valid" reason.
- ▢ Correct code but unmet conditions (e.g. below min order) returns a
  **specific** reason ("Minimum order is £30"), never a generic "invalid".

## 4. Audience allow/deny

- ▢ **first_order** — a brand-new email gets the discount at checkout; an email
  with prior orders does not (server does the orders lookup in create-intent).
- ▢ **specific_emails** — only listed emails get it; others don't. (The checkout
  coupon preview notes "confirmed at checkout" for these; create-intent enforces.)
- ▢ **new_customer** — same allow/deny behaviour as first_order.

## 5. Cart below min_order_amount shows no discount — everywhere

- ▢ With a min-order offer active and a basket **below** the minimum: no
  strikethrough on cards/PDP, no discount line in the cart drawer, no discount
  in the checkout summary, and create-intent charges the full amount. Crossing
  the threshold makes the discount appear consistently on every surface.

## 6. Money integrity for a discounted order

- ▢ checkout summary **total** == the Stripe **charged amount** (Pay button) ==
  the persisted **order.total** == the confirmation page **Total paid**.
- ▢ `order.discount_amount` / `coupon_code` / `offer_id` are persisted (after
  `16_order_discounts.sql`), and one `offer_redemptions` row is written.
- ▢ On a DB without `16_order_discounts.sql`, the order still saves (the
  `isMissingColumn()` fallback drops the new columns) and the redemption insert
  fails silently — the order is never lost.

## 7. No-offer regression (byte-identical to pre-Phase-3)

- ▢ With **no** active offer and no coupon: create-intent returns the same
  subtotal / deliveryFee / total as before; Stripe amount is unchanged. The only
  additions are metadata keys `discount_amount:"0.00"`, `coupon_code:""`,
  `offer_id:""` — which do not affect the charged amount.

---

## ⚠️ Blocker — schema not applied

A read-only probe of the live database (service role) on <run date> found **no
`offers` table at all** — and none of `offer_category_rules`,
`offer_product_rules`, `offer_emails`, `offer_redemptions`, or the
`validate_coupon()` function. `supabase/sql/15_offers.sql` has never been
applied.

Additionally, the `15_offers.sql` **on disk is a simpler earlier draft**
(`title`/`discount_type`/`discount_value`/`min_subtotal`/`active`) that does
**not** match the rich Phase-1 schema the Phase 2–5 code targets
(`name`/`type`/`enabled`/`stackable`/`eligibility_scope`/child tables/
`validate_coupon`/exclusion constraint). `scripts/test-offers-rls.mjs` on disk
tests that same simple draft.

**Before any check above can pass**, the rich Phase-1 migration (and the
matching RLS test) must be authored and applied. Until then the offer routes
compile and the storefront degrades gracefully (no offers shown, no discount,
checkout unchanged), but no offer functionality is live.
