# Le Rasa Bakery — Offer Management System
### Claude Code implementation prompt (paste into Claude Code, run phase by phase)

This is grounded in the actual current codebase (file paths, line numbers, and
conventions below were verified directly, not guessed). It is split into 6
phases with hard stop points, because this touches the checkout money-path and
the database schema — a single giant diff here is how production sites break.

**How to use this file:** paste "PHASE 0" + "PHASE 1" into Claude Code first.
Review the migration before applying it. Then paste each subsequent phase one
at a time, in order, only after the previous phase builds clean and you've
reviewed the diff. Do not paste all 6 phases at once.

---

## PHASE 0 — Ground rules (include this block with every phase)

```
You are working in the Le Rasa Bakery repo: Next.js 14 (App Router) + TypeScript
+ Supabase (Postgres, service-role admin client, anon client with RLS) + Stripe.

Read these existing files before making any change — they define the
conventions you must follow, not just background:

- lib/pricing.ts — shared, pure, client+server-safe money math (this is the
  pattern to extend, not replace, for offer discount math).
- lib/site-settings.ts + lib/site-settings-server.ts — how public settings are
  typed, defaulted, normalised, and read server-side with cache:"no-store".
- lib/admin-auth.ts + lib/admin-api.ts — the admin auth pattern
  (isAuthedRequest() server-side header check against ADMIN_AUTH_HEADER; 
  adminGet/adminSend/adminUpload client-side fetch wrappers). Every new admin
  API route MUST use isAuthedRequest(); every new admin UI call MUST use
  adminGet/adminSend, never a raw fetch.
- app/api/admin/products/route.ts + app/api/admin/products/[id]/route.ts —
  the CRUD route shape to mirror (GET list w/ pagination, POST create,
  PUT full update, PATCH partial update, DELETE).
- app/api/checkout/create-intent/route.ts — where the authoritative,
  server-computed order total is built today (product prices looked up
  fresh from Supabase, delivery fee resolved, then a Stripe PaymentIntent is
  created with amount + metadata). This is where discount calculation MUST
  be inserted — never trust a discount amount sent from the client.
- app/api/orders/create/route.ts — where the paid order is persisted after
  Stripe confirms payment; has an isMissingColumn() fallback pattern for
  writing extra columns that may not exist yet on an older DB — follow the
  same defensive pattern for any new order columns you add.
- components/cart/cart-context.tsx — client-side cart state (localStorage),
  computes subtotal/deliveryFee/total client-side for DISPLAY ONLY; the
  server in create-intent recomputes authoritatively and is the only source
  of truth for what's actually charged.
- components/animated-product-card.tsx — renders `£{product.price.toFixed(2)}`
  literally in FOUR places (collapsed card, focused-image badge, slide-in
  detail panel, and one more) — each with different surrounding styles.
  Do not duplicate discount-formatting logic four times; extract one small
  shared piece and use it at all four call sites.
- components/announcement-bar.tsx — server component, reads
  getPublicSettings().announcement, renders nothing if disabled/empty.
- components/rotating-banners.tsx — client component, renders the
  auto-rotating banners on /menu. Line ~49-51 has:
  `<span className="... text-[200px] ...">{count}</span>` — a decorative
  watermark that today is just the filtered product count and has NOTHING
  to do with any offer. This is the "hero banner decorative highlight."
- supabase/sql/00_full_setup.sql — the master schema + RLS file. New
  migrations are separate numbered files (latest is
  supabase/sql/14_orders_realtime_broadcast.sql) that ALTER/CREATE
  additively — never edit 00_full_setup.sql's already-shipped tables in
  place; add a new numbered file (start at 15_).
- scripts/test-rls.mjs — the existing RLS smoke-test pattern
  (service-role writes throwaway rows, anon client asserts isolation, then
  cleans up). Follow this pattern for testing the new offers RLS.
- app/admin/dashboard/layout.tsx — sidebar nav array, ~line 25-31. Add the
  new "Offers" admin page here, after "Products" and before "Orders".

Ground rules for every phase:
- Only make the changes described in that phase. Do not refactor unrelated
  code, rename existing fields, or "improve" things not asked for.
- Never trust client-sent prices or discount amounts for anything that
  touches money. All discount math for the actual charge happens server-side
  in create-intent, recomputed from the DB, exactly like existing subtotal
  logic.
- Follow existing naming conventions (snake_case DB columns, the existing
  admin route/page patterns) instead of inventing new ones.
- After each phase: run `npm run build` (or `tsc --noEmit`) and fix any type
  errors before stopping. Report a short summary of files changed and stop —
  do not proceed to the next phase automatically.
- Stop and ask before: deleting any file, adding a new npm dependency,
  editing supabase/sql/00_full_setup.sql, or changing the ADMIN_AUTH /
  Stripe integration.
```

---

## PHASE 1 — Database schema, migration, RLS

```
GOAL
Design and create a normalized, indexed, RLS-protected schema for the Offer
Management System as a NEW migration file: supabase/sql/15_offers.sql
(additive only — do not touch 00_full_setup.sql or any existing migration).

TABLES TO CREATE

1. offers — one row per offer.
   Columns (types/constraints as appropriate; use `check` constraints for
   every enum-like column instead of a separate lookup table, matching how
   `orders.status` already does it in 00_full_setup.sql):
   - id uuid pk default gen_random_uuid()
   - name text not null                     -- internal admin label
   - type text not null                      -- 'percentage' | 'fixed_amount' |
                                              --   'buy_x_get_y' | 'free_delivery' |
                                              --   'coupon' | 'custom'
   - enabled boolean not null default false  -- manual admin on/off switch
   - stackable boolean not null default false -- can run alongside another
                                              --   active offer?
   - priority integer not null default 0     -- tie-breaker when resolving
                                              --   which non-stackable offer wins
   - percentage_value numeric(5,2)           -- for type='percentage', or
                                              --   type='coupon' + coupon_discount_type='percentage'
   - fixed_amount_value numeric(10,2)        -- for type='fixed_amount', or
                                              --   coupon + coupon_discount_type='fixed_amount'
   - buy_x_quantity integer                  -- for type='buy_x_get_y'
   - get_y_quantity integer
   - get_y_discount_percent numeric(5,2) not null default 100  -- 100 = free
   - free_delivery boolean not null default false  -- can combine with any type
   - coupon_code text unique                 -- required + unique when type='coupon'
   - coupon_discount_type text               -- 'percentage' | 'fixed_amount', only for type='coupon'
   - eligibility_scope text not null default 'all'  -- 'all' | 'categories' | 'products'
   - min_order_amount numeric(10,2)
   - max_order_amount numeric(10,2)
   - min_quantity integer
   - max_quantity integer
   - audience text not null default 'everyone'  -- 'everyone' | 'first_order' |
                                                 --   'new_customer' | 'specific_emails'
   - usage_limit_total integer                -- null = unlimited
   - usage_limit_per_customer integer         -- null = unlimited
   - start_at timestamptz
   - end_at timestamptz
   - time_start time                          -- optional daily time-of-day window
   - time_end time
   - days_of_week smallint[]                  -- 0=Sun..6=Sat; null = every day
   - announcement_text text                   -- overrides top bar when active
   - hero_heading text
   - hero_subtext text
   - hero_highlight_text text                 -- the big watermark: "30%", "FREE", "BUY 1 GET 1"
   - cta_text text
   - cta_link text
   - banner_image_url text                    -- decorative banner graphic (optional)
   - background_image_url text                -- full section background image (optional, separate from banner_image_url)
   - banner_bg_color text                     -- hex override for the banner section background; null = theme default (#F9EEEA)
   - banner_text_color text                   -- hex override for heading/subtext color; null = theme default (#612437)
   - cta_button_color text                    -- hex override for the CTA button; null = theme default (wine)
   - created_at timestamptz not null default now()
   - updated_at timestamptz not null default now()

2. offer_category_rules — normalized category eligibility.
   - id uuid pk, offer_id uuid not null references offers(id) on delete cascade
   - category text not null
   - mode text not null check (mode in ('include','exclude'))

3. offer_product_rules — normalized product eligibility.
   - id uuid pk, offer_id uuid not null references offers(id) on delete cascade
   - product_id uuid not null references products(id) on delete cascade
   - mode text not null check (mode in ('include','exclude'))

4. offer_emails — for audience='specific_emails'.
   - id uuid pk, offer_id uuid not null references offers(id) on delete cascade
   - email text not null

5. offer_redemptions — usage tracking (powers usage limits, "first order
   only"/"new customer only" checks, and is the foundation the "Future
   Features" section below will build on — loyalty, flash sales, etc. all
   need a redemption ledger, so get this right now).
   - id uuid pk, offer_id uuid not null references offers(id) on delete cascade
   - order_id uuid references orders(id) on delete set null
   - email text
   - discount_amount numeric(10,2) not null default 0
   - created_at timestamptz not null default now()

ELIGIBILITY RESOLUTION (document this as a comment in the migration file,
and implement it exactly this way in the Phase 2 pricing engine):
  base set =
    scope='all'        -> every visible product
    scope='categories' -> products whose category is in offer_category_rules
                           where mode='include'
    scope='products'   -> products in offer_product_rules where mode='include'
  then, regardless of scope, REMOVE:
    - any product in offer_product_rules where mode='exclude'
    - any product whose category is in offer_category_rules where mode='exclude'
This lets "apply to all EXCEPT these categories/products" work without a
separate flag, matching the 5 eligibility options in the spec.

INDEXES
- offers: index on (enabled, start_at, end_at) — this is the "find the
  currently active offer" query, run on every storefront page load and every
  checkout, so it must be indexed.
- offers: unique index on coupon_code where coupon_code is not null.
- offer_category_rules: index on (offer_id), index on (category).
- offer_product_rules: index on (offer_id), index on (product_id).
- offer_redemptions: index on (offer_id, email), index on (order_id).

DATA-LEVEL GUARANTEE AGAINST OVERLAPPING NON-STACKABLE OFFERS
Enforce "only one non-stackable offer active at a time" at the database
level, not just in application code, using an exclusion constraint:
  create extension if not exists btree_gist;
  alter table offers add constraint one_active_non_stackable_offer
    exclude using gist (
      stackable with =,
      tstzrange(coalesce(start_at, '-infinity'), coalesce(end_at, 'infinity')) with &&
    ) where (stackable = false and enabled = true);
This makes it impossible for two non-stackable offers to have overlapping
enabled windows, even if two admins edit at once — the DB rejects the second
INSERT/UPDATE with a clear constraint-violation error the API can catch and
turn into a friendly "another offer is already active in this period"
message.

RLS
- Enable RLS on all 5 new tables (service role bypasses it for the admin
  panel exactly like every existing admin table).
- offers: public (anon) SELECT policy, but EXCLUDE rows where type='coupon'
  from general listing — anon should never be able to enumerate coupon
  codes via a bare `select * from offers`. Non-coupon enabled+in-window
  offers ARE public (this is what drives the storefront banner and product
  pricing display, same trust level as products/site_settings today).
- Add a SECURITY DEFINER Postgres function `public.validate_coupon(code text)`
  that anon can EXECUTE, which looks up an exact coupon_code match
  server-side inside Postgres (bypassing the anon SELECT restriction just
  for this one lookup) and returns the matching offer's public fields only
  on an exact match, or nothing. This is how the checkout coupon-entry field
  validates a code without ever exposing the full coupon list.
- offer_category_rules / offer_product_rules: public SELECT (needed for
  client-side price-preview eligibility checks) — no write access for anon.
- offer_emails: NO public SELECT (this is an admin-only allowlist, not
  something a customer's browser needs to read).
- offer_redemptions: NO public SELECT (used for server-side enforcement
  only).

VERIFICATION SCRIPT
Extend scripts/test-rls.mjs (or add scripts/test-offers-rls.mjs following its
exact same load-env / service-role-setup / anon-assert / cleanup pattern) to
assert: anon can read an enabled+in-window non-coupon offer; anon CANNOT read
a coupon-type offer directly; anon CAN get a match via validate_coupon() with
the right code and gets nothing with a wrong code; the exclusion constraint
actually rejects a second overlapping non-stackable offer.

STOP after this phase. Show me the migration file and wait for me to apply
it to Supabase before continuing to Phase 2.
```

---

## PHASE 2 — Shared offer/pricing engine

```
GOAL
Create lib/offers.ts: a pure, client+server-safe module (no imports with
side effects — same constraint lib/pricing.ts already follows) that is the
SINGLE place discount logic lives. Both the client (for cart/PDP price
preview) and the server (for the authoritative checkout charge) call the
same functions, so the numbers never drift.

EXPORTS (design the exact TypeScript signatures, but the responsibilities
are):
- `type Offer` — mirrors the `offers` row shape from Phase 1, plus resolved
  `categoryRules` / `productRules` arrays.
- `isOfferCurrentlyActive(offer, now: Date): boolean` — enabled AND within
  start_at/end_at AND within time_start/time_end AND today is in
  days_of_week (all of these are optional/nullable — absent means "no
  restriction"). This is how "automatically activate/deactivate" works:
  there is no cron flipping a status column: whether an offer is "active"
  right now is always DERIVED from enabled+schedule at read time. Note this
  explicitly in a code comment so a future maintainer doesn't try to add a
  cron job that isn't needed.
- `resolveEligibleProductIds(offer, allProducts): Set<string>` — implements
  the base-set-then-subtract-exclusions algorithm documented in the Phase 1
  migration comment.
- `isProductEligible(offer, product): boolean`
- `computeOfferDiscount(offer, cartItems, cartSubtotal): { discountAmount: number, freeDelivery: boolean, appliedItemIds: string[] }`
  — implements the actual math per type (percentage off eligible items,
  fixed amount off eligible subtotal capped at that subtotal, buy_x_get_y
  by sorting eligible matching items and discounting the cheapest
  qualifying Y at get_y_discount_percent, free_delivery flag, coupon using
  coupon_discount_type). Every money value rounds with the existing
  `round2()` from lib/pricing.ts — do not re-implement rounding.
- `checkCartConditions(offer, cartSubtotal, cartQuantity): { ok: boolean, reason?: string }`
  — min/max order amount, min/max quantity.
- `checkAudienceEligibility(offer, context: { email?: string, isFirstOrder?: boolean, isNewCustomer?: boolean }): { ok: boolean, reason?: string }`
  — for 'first_order'/'new_customer'/'specific_emails'; the actual "is this
  their first order" lookup against the orders table happens server-side
  (needs a DB query) and is passed in as a boolean — this function only
  applies the rule, it doesn't query the DB (keep it pure/testable).
- `resolveActiveOffer(offers: Offer[], now: Date): Offer | null` — filters to
  currently-active offers, and if more than one non-stackable offer is
  somehow active (shouldn't happen given the Phase 1 exclusion constraint,
  but defend anyway), picks the highest `priority` then most recent
  `created_at`. If a stackable offer plus a non-stackable offer are both
  active, both apply (this function should return the winning "primary"
  banner-driving offer AND separately expose the full list of stackable
  offers that also apply to pricing — design this as
  `resolveActiveOffers(offers, now): { primary: Offer | null, stackable: Offer[] }`).

CONSTRAINTS
- No network calls, no Supabase client import, no React import in this file
  — pure functions and types only, exactly like lib/pricing.ts, so it can be
  unit-tested and used identically on client and server.
- Do not touch lib/pricing.ts's existing exports/behavior — import round2()
  from it, add to it only if genuinely shared, don't restructure it.

DONE WHEN
`npm run build` passes and lib/offers.ts has zero dependencies beyond
lib/pricing.ts types.

STOP after this phase and wait for confirmation before Phase 3.
```

---

## PHASE 3 — Backend: public + admin APIs, checkout integration

```
GOAL
Wire lib/offers.ts into real API routes: admin CRUD for managing offers, a
public read for the storefront, and — the critical part — the authoritative
discount calculation inside the existing checkout flow.

3A. ADMIN CRUD — mirror app/api/admin/products/route.ts and
    app/api/admin/products/[id]/route.ts exactly (same isAuthedRequest()
    guard, same adminDb() helper, same try/catch-wrapped-500 pattern):
    - app/api/admin/offers/route.ts — GET (paginated list, newest first) +
      POST (create; validate required fields per `type` before insert;
      surface the Phase-1 exclusion-constraint violation as a friendly
      "Another non-stackable offer is already active in this window"
      error rather than a raw Postgres error).
    - app/api/admin/offers/[id]/route.ts — PUT (full update), PATCH
      (partial — used for the enabled toggle), DELETE.
    - app/api/admin/offers/[id]/duplicate/route.ts — POST: reads the offer
      + its category/product/email rules, inserts a copy with
      `enabled: false` and `" (copy)"` appended to name, returns the new id.
    - When PUT/PATCH sets `enabled: true` on a non-stackable offer, rely on
      the Phase 1 exclusion constraint to reject overlaps — catch that
      specific Postgres error code and return a 409 with a clear message;
      do not pre-check with a separate SELECT (that's a race condition —
      let the DB constraint be the source of truth).

3B. PUBLIC READ — app/api/offers/active/route.ts (GET, no auth, follows the
    same shape as app/api/site-settings/route.ts and app/api/categories/route.ts:
    force-dynamic, no-store, wrapped in try/catch returning safe fallback on
    any failure — never throw a raw error to the storefront). Returns the
    resolved `{ primary, stackable }` from lib/offers.ts (computed using the
    anon-readable non-coupon offers — reuse the RLS-scoped anon client
    pattern already used in lib/site-settings-server.ts, not the admin
    client, since this is a public unauthenticated read).

3C. COUPON VALIDATION — app/api/offers/validate-coupon/route.ts (POST,
    body: { code, cartItems, postcode? }). Calls the `validate_coupon`
    Postgres function from Phase 1, then if matched, runs it through
    lib/offers.ts's condition/eligibility checks against the submitted cart
    and returns either the resolved discount preview or a specific reason
    it doesn't apply ("Minimum order is £30", "This code is for new
    customers only", etc.) — never a generic "invalid code" when the code
    IS valid but conditions aren't met.

3D. CHECKOUT INTEGRATION — this is the part that must not break existing
    payments. In app/api/checkout/create-intent/route.ts:
    - AFTER the existing authoritative subtotal is computed from DB prices
      (existing code, unchanged) and BEFORE `resolveDeliveryFee` is called,
      fetch active offers (service-role client, same as the rest of this
      route) and any coupon code included in the request body, and compute
      the discount via lib/offers.ts using the REAL server-verified cart
      items and prices (never the client's numbers).
    - If free_delivery resolves true for the applicable offer(s), pass 0 to
      the delivery fee instead of calling resolveDeliveryFee.
    - Add `discount_amount`, `coupon_code`, `offer_id` (nullable) into the
      existing `metadata` object passed to `stripe.paymentIntents.create`
      (same pattern as the existing subtotal/delivery_fee/total metadata
      keys) — total charged = subtotal - discount + deliveryFee, still run
      through `toPence(round2(...))`.
    - Re-validate min/max order amount and quantity conditions server-side
      here too (don't just trust that the client wouldn't have shown the
      offer if conditions weren't met) — return a 409 with a clear message
      if the cart no longer qualifies (e.g. items were removed after the
      discount was shown).
    - Return the discount breakdown in the response alongside the existing
      subtotal/deliveryFee/total so the checkout UI can show it.

3E. ORDER PERSISTENCE — in app/api/orders/create/route.ts:
    - Add a new migration supabase/sql/16_order_discounts.sql: `alter table
      orders add column if not exists discount_amount numeric(10,2) not
      null default 0; alter table orders add column if not exists
      coupon_code text; alter table orders add column if not exists
      offer_id uuid references offers(id) on delete set null;` — additive,
      following the exact `add column if not exists` guard pattern already
      used throughout 00_full_setup.sql.
    - Read discount_amount/coupon_code/offer_id back out of the verified
      PaymentIntent's metadata (same way `metaSubtotal`/`metaDelivery` are
      already read), include them in `fullOrder`, and follow the EXACT
      existing `isMissingColumn()` retry pattern for the fallback insert so
      orders still save correctly on a DB that hasn't had 16_ applied yet.
    - After a successful order insert, if an offer was applied, insert one
      row into `offer_redemptions` (offer_id, order_id, email,
      discount_amount) — best-effort, same "don't fail the whole order if
      this write fails" posture as the existing order_items insert.

3F. PER-OFFER ANALYTICS — app/api/admin/offers/[id]/analytics/route.ts (GET,
    isAuthedRequest-guarded, admin client). Aggregates purely from
    offer_redemptions joined to orders (no new tables needed):
    - timesUsed: count of offer_redemptions for this offer_id.
    - revenueGenerated: sum of orders.total for orders in those redemptions.
    - totalDiscountGiven: sum of offer_redemptions.discount_amount.
    - activeOrders: count where orders.status not in
      ('delivered','cancelled','refunded').
    - redemptions: the raw list (order id, email, discount_amount,
      created_at) for a small drill-down table, most recent first, capped
      at e.g. 100 rows.
    - conversionRate: timesUsed / total orders placed within the offer's
      [start_at, end_at] window (or since the offer's created_at if either
      date is null) — guard divide-by-zero by returning null, not 0 or
      Infinity, when there were zero orders in that window. Document in a
      comment that this is a proxy (orders-with-offer / all-orders-in-window),
      not true funnel conversion, since there is no page-view/impression
      tracking in this app and adding one is out of scope here.

CONSTRAINTS
- Do not change the existing subtotal/delivery-fee logic that's already
  correct — only insert the discount step between them.
- Do not remove or change the existing isMissingColumn() fallback behavior.
- Every new admin route must reject with 401 via isAuthedRequest() exactly
  like the existing ones — do not invent a different auth check.

DONE WHEN
- `npm run build` passes.
- A manual test: create a 10%-off-everything offer via the new admin API,
  add an item to cart, hit create-intent, and confirm the PaymentIntent
  amount reflects the 10% discount and the metadata carries discount_amount.
- Existing checkout flow with NO active offer produces byte-identical
  totals to before this phase (no regression).
- The analytics endpoint returns correct numbers against a couple of
  manually-inserted test redemptions, including the null-conversion-rate
  edge case.

STOP after this phase and wait for confirmation before Phase 4.
```

---

## PHASE 4 — Admin UI (independent Offers module)

```
GOAL
Build the Offer Management module as a fully independent admin section —
its own nav entry, its own route tree, its own pages. This is a hard
requirement, not a style preference:

DO NOT add or edit any offer/banner field inside
app/admin/dashboard/settings/page.tsx. That file (Content & Settings)
must end this phase with ZERO new offer-related code in it. Everything
offer- or banner-related lives under app/admin/dashboard/offers/** and its
own API routes. If you find yourself about to touch settings/page.tsx for
anything other than reading it as a styling reference, stop — that's the
wrong file.

1. app/admin/dashboard/layout.tsx — add a new nav entry
   `{ href: "/admin/dashboard/offers", label: "Offers" }` to the array
   (~line 25-31) in this exact order: Dashboard, Products, Offers, Orders,
   Payments, Delivery Settings, Content & Settings, Analytics — i.e. insert
   it right after "Products" (~line 27) and before "Orders". Change nothing
   else in this file.

2. app/admin/dashboard/offers/page.tsx — the Offer Dashboard (list view).
   Styled consistently with app/admin/dashboard/products/page.tsx (reuse
   the same WINE/BERRY color constants, inputStyle/primaryBtn/ghostBtn
   button styles, and adminGet/adminSend calls — do not invent new styling
   primitives). Include:
   - A search input (filters the fetched list client-side by name/coupon
     code — no need for server-side search given expected offer volumes).
   - A status filter (All / Active now / Scheduled / Expired / Disabled)
     and a type filter (the 6 offer types) — both client-side dropdowns
     over the same fetched list.
   - Table columns: Name, Type, Status (computed pill — "Active now" /
     "Scheduled" / "Expired" / "Off" — derive this from
     isOfferCurrentlyActive() in lib/offers.ts, never hardcode it),


     Priority, Start/End dates.
   - Row actions: Edit, Duplicate (calls the Phase 3 duplicate endpoint),
     the enabled Toggle (calls PATCH), Delete (confirm dialog first, same
     pattern as any existing delete button in this repo).
   - "+ New Offer" button at the top.

3. app/admin/dashboard/offers/[id]/page.tsx (an `id === "new"` route is
   fine for create — one page handling both create and edit) — the
   create/edit form, organized into clearly separated sections. Use a
   left-side (or top) tab/section nav within this one page rather than
   separate routes per section, so Save/state stays simple:

   a) Basics — name, type selector (changes which fields below are shown/
      required), stackable toggle, priority.

   b) Discount value — fields relevant to the selected type only
      (percentage value / fixed amount / buy X get Y quantities +
      get-Y-discount% / free delivery toggle / coupon code + coupon
      discount type).

   c) Eligibility — scope selector (all/categories/products) + include-list
      picker (reuse whatever multi-select pattern already exists for
      categories in this admin — check
      app/api/admin/products/categories/route.ts for the category source)
      + a separate "Exclude" picker for categories and products (always
      visible regardless of scope).

   d) Offer conditions — min/max order amount, min/max quantity,
      usage_limit_total, usage_limit_per_customer.

   e) Schedule — start/end date-time pickers, optional daily time-of-day
      range, optional days-of-week checkboxes, the enabled toggle.

   f) Customer rules (audience) — everyone / first order only / new
      customers only / specific emails (textarea, one per line, parsed to
      the offer_emails table).

   g) Coupon management — only shown when type='coupon': coupon_code input
      (uniqueness enforced by the DB, surface a clear inline error on
      conflict), coupon_discount_type, discount value, and the
      start/end schedule from (e) doubles as the expiry — do not build a
      second separate expiry field.

   h) Banner Management — this is what drives the live Special Offer
      banner. Fields: hero_heading, hero_subtext, hero_highlight_text
      (label clearly: "Large watermark shown on the Special Offer banner —
      e.g. 30%, 50%, FREE, BUY 1 GET 1. Leave blank to show the product
      count instead."), cta_text, cta_link, announcement_text (label:
      "Overrides the top announcement bar while this offer is active"),
      banner_image_url + background_image_url (both optional uploads via
      the existing adminUpload() helper), banner_bg_color, banner_text_color,
      cta_button_color (simple `<input type="color">` paired with a hex
      text input for each — no new color-picker dependency; do not add an
      npm package for this).

   i) Live Preview — a panel (sidebar on desktop, section below the form on
      mobile) that renders, from the CURRENTLY-EDITED in-memory form state
      (not the saved DB row), a miniature but real preview of: the
      announcement bar text, the Special Offer banner (heading/subtext/
      highlight watermark/CTA/colors), and one sample product card showing
      strikethrough original price + discounted price using the form's
      current discount settings against a representative product. Update
      on every field change (debounce ~300ms is fine). To avoid duplicating
      markup, extract the presentational JSX of the banner slide and the
      announcement bar into small prop-driven subcomponents (e.g.
      `<BannerPreview heading subtext highlightText ctaText bgColor
      textColor />`) that both the real site components (fed by live data
      in Phase 5) and this preview panel (fed by form state) import and
      render identically — do not hand-roll a second copy of the banner
      markup here.

   j) Analytics tab — only shown when editing an existing offer (not on
      create). Calls the Phase 3 `/api/admin/offers/[id]/analytics`
      endpoint and renders it as stat cards in the same visual style as
      the existing Dashboard stat cards in app/admin/dashboard/page.tsx
      (~line 122, the `stats` array/map pattern) — Times Used, Revenue
      Generated, Total Discount Given, Active Orders, Conversion Rate
      (show "—" when null, not "NaN%" or "0%"), plus a small table of
      recent redemptions.

   Save persists via the Phase 3 admin API; Delete via the same
   confirm-then-DELETE pattern used elsewhere.

CONSTRAINTS
- Reuse existing visual language (colors, spacing, button styles, Toggle
  component) from app/admin/dashboard/settings/page.tsx and
  app/admin/dashboard/products/ as a STYLING reference only — no shared
  state, imports, or fields with that file.
- Client-side validation should mirror (not replace) the server-side
  validation from Phase 3 — the server is still the source of truth.
- The Live Preview panel must never call any write/save endpoint — it is
  read-only rendering of local form state.

STOP after this phase and wait for confirmation before Phase 5.
```

---

## PHASE 5 — Storefront integration

```
GOAL
Make the active offer automatically show up everywhere the spec lists,
without a stored "mirror" copy anywhere — the offers table stays the single
source of truth, read live, exactly like every other public setting in this
app already is.

1. lib/use-active-offer.ts — new client hook, same shape as
   lib/use-site-settings.ts (fetch /api/offers/active with cache:"no-store",
   refetch on window focus, return a sensible empty default so callers never
   see undefined).

2. components/announcement-bar.tsx — this is currently a server component
   reading only getPublicSettings().announcement. Also read the active
   offer (server-side, via the same pattern as
   lib/site-settings-server.ts — add a getActiveOfferServer() alongside
   getPublicSettings() rather than duplicating the fetch logic). Precedence:
   if an active offer has a non-empty announcement_text, show that;
   otherwise fall back to the existing manual site_settings.announcement
   exactly as today. Do not change the component's markup/styling, only the
   text source.

3. components/rotating-banners.tsx — two changes, both additive:
   - The watermark span (~line 49-51): change
     `{count}` to `{activeOffer?.hero_highlight_text || current.watermark_text || count}`
     — i.e. an active offer's highlight wins, then a manually-set
     per-banner watermark_text (if that field exists — add it to
     RotatingBanner in lib/site-settings.ts the same way if it doesn't
     exist yet), then the existing product-count fallback. If
     hero_highlight_text is an empty string, treat it as absent (fall
     through), matching the spec's "if empty, hide it" for the highlight
     specifically — meaning empty string should NOT show as a blank
     watermark, it should fall through to the next option in the chain.
   - When there's an active offer with hero_heading/hero_subtext/cta_text/
     cta_link set, and the currently-displayed slide is the "offer" type
     banner, show the offer's values instead of that banner's stored
     heading/subtext/cta — same precedence logic as the announcement bar.
     Do not change animation, rotation timing, or any other banner type's
     behavior.
   - This component is a client component — fetch the active offer via the
     new useActiveOffer() hook from step 1, passed down or called directly
     inside RotatingBanners.
   - If Phase 4 already extracted a prop-driven `<BannerPreview>` /
     announcement-bar presentational subcomponent for the admin Live
     Preview panel, reuse that SAME subcomponent here (fed by real
     server/live data instead of form state) rather than keeping two
     copies of the banner markup in sync by hand. If Phase 4 hasn't run yet
     or didn't extract one, do it now and retrofit Phase 4's preview to use
     it — one implementation, two data sources.

4. Product pricing display — create ONE small shared piece (a component
   `components/product-price.tsx` or a pure formatter in lib/offers.ts —
   your call, but ONE implementation) that, given a product + the resolved
   active/stackable offers, returns { hasDiscount, originalPrice,
   discountedPrice, savedAmount, badgeText }. Use it at:
   - All four `£{product.price.toFixed(2)}` sites in
     components/animated-product-card.tsx — replace each with the shared
     price display (strikethrough original + discounted price + small
     savings/badge), preserving each site's existing surrounding
     className/layout exactly, only changing what's rendered for the price
     itself.
   - The product detail page/modal (app/menu/[slug]/page.tsx).
   - components/cart/cart-context.tsx — this is display-only math for the
     drawer; add discount awareness here too (fetch active offers via the
     public endpoint, run cartItems through lib/offers.ts) so the cart
     drawer subtotal/total match what checkout will actually charge. Keep
     the existing CartItem shape and localStorage persistence unchanged —
     add the discount as a derived value, not stored state.
   - app/checkout/page.tsx order summary — show subtotal, discount line
     (with coupon code / offer name if applicable), delivery fee, total —
     sourced from the response of the Phase 3 create-intent call (already
     returns the breakdown), not recomputed client-side.
   - Order confirmation page (app/order-confirmation/[orderId]/page.tsx) —
     read discount_amount/coupon_code back off the saved order and show it
     in the summary.

CONSTRAINTS
- Do not add a new database write path for "syncing" offer content into
  site_settings — everything reads the offers table live, as described
  above. This avoids a second source of truth that can drift.
- Preserve all existing animation/styling/responsive behavior in every
  touched component; only the data being displayed changes.
- Coupon code entry (checkout page): a simple input + "Apply" button that
  calls the Phase 3 validate-coupon endpoint and shows its returned
  discount preview or reason-it-doesn't-apply message — do not
  client-side-guess whether a code is valid.

DONE WHEN
- Activating a percentage offer via the new admin panel updates: the top
  announcement bar, the Special Offer banner's heading/highlight watermark,
  product card prices (strikethrough + discount), the PDP, the cart drawer,
  and the checkout summary — all without a page-code change, and all
  disappearing cleanly when the offer is deactivated or expires.
- A cart that no longer meets an offer's conditions (e.g. below minimum
  order amount) shows no discount, consistently across every surface.

STOP after this phase and wait for confirmation before Phase 6.
```

---

## PHASE 6 — Verification

```
GOAL
Prove the system is correct and hasn't regressed anything, before calling
this done.

1. Run `npm run build` and `npm run test:rls` (plus the new offers RLS test
   from Phase 1) — all must pass.
2. Write a short manual QA checklist as a comment block or a
   docs/offers-qa-checklist.md covering: create each of the 6 offer types
   end to end; verify the DB exclusion constraint actually rejects a second
   overlapping non-stackable offer (attempt it and confirm the friendly 409
   from Phase 3, not a raw Postgres error); verify a coupon-type offer is
   NOT readable via a plain anon `select * from offers` but IS resolvable
   via validate_coupon() with the right code; verify first-order-only and
   specific-emails audiences correctly allow/deny; verify a cart below
   min_order_amount shows no discount anywhere; verify checkout total
   matches order.total matches the Stripe-charged amount for a discounted
   order; verify the existing (no-offer) checkout flow is byte-identical to
   pre-Phase-3 behavior.
3. Confirm nothing in Phases 1-5 required editing
   supabase/sql/00_full_setup.sql, lib/pricing.ts's existing exports, or
   the Stripe/admin-auth integration — if anything did, flag it explicitly
   for review rather than silently shipping it.
4. Confirm module independence: `git diff` (or grep) shows ZERO changes to
   app/admin/dashboard/settings/page.tsx, and every offer-related file
   lives under app/admin/dashboard/offers/**, app/api/admin/offers/**,
   app/api/offers/**, lib/offers.ts, or the new supabase/sql/15_/16_ files.
5. Manually verify the Live Preview panel matches the live site: set a
   percentage offer's banner fields in the editor, confirm the preview
   panel shows them immediately (before Save), then Save and confirm the
   live /menu page now matches what the preview showed.
6. Manually verify the Analytics tab against the redemptions inserted
   during step 5's checkout test — Times Used, Revenue Generated, and
   Total Discount Given should match exactly.

Report back: files changed per phase, any deviations from this spec and
why, and the QA checklist results.
```

---

## Note on future extensibility (context only, not a task)

The `offer_redemptions` ledger, the `offers.type` enum, and the eligibility
junction tables are deliberately generic so that loyalty rewards, flash
sales, festival offers, membership discounts, referral rewards, and
seasonal campaigns can all be modeled as more `offers` rows (or a thin
extension table referencing `offers.id`) later, without a schema rewrite.
Don't build any of those now — this note is so Claude Code doesn't
paint itself into a corner on naming/shape during Phases 1-2.
