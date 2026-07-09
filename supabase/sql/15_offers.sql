-- ============================================================
-- Le Rasa Bakery — 15_offers.sql
-- ------------------------------------------------------------
-- The offer system's schema: one `offers` table plus three normalised child
-- tables (category rules, product rules, email allowlist), a redemption
-- ledger, the `validate_coupon()` lookup, and the exclusion constraint that
-- keeps at most one auto-applied non-stackable offer live at a time.
--
-- This file is the source of truth for the shape lib/offers.ts, lib/offers-
-- admin.ts and the /api/admin/offers + /api/offers/* routes read and write.
--
-- IDEMPOTENT: safe to run repeatedly (IF NOT EXISTS, DROP POLICY IF EXISTS,
-- guarded DO blocks) — same conventions as 00_full_setup.sql.
--
-- ⚠ NOT purely additive. Section 0 replaces the earlier *draft* `offers` table
-- (title / discount_type / discount_value / min_subtotal / active) that exists
-- on some databases and does not match this schema. It refuses to run if that
-- table holds any rows, so it can never destroy real offers.
--
-- 16_order_discounts.sql may already have been applied, in which case
-- `orders.offer_id` exists with a foreign key into the old table. Dropping the
-- old table takes that FK with it, so section 2 re-attaches it. Running the
-- two files in either order therefore converges on the same result.
--
-- Security posture:
--   * anon reads ENABLED, NON-COUPON offers only (coupons must not be
--     enumerable — they are code-gated through validate_coupon()).
--   * anon reads the category/product rule tables so the storefront and the
--     coupon preview can resolve eligibility. These carry no secrets.
--   * offer_emails and offer_redemptions have NO anon policy — the email
--     allowlist and the redemption ledger are private.
--   * The admin panel uses the SERVICE ROLE key server-side, which bypasses
--     RLS entirely. The AUTHORITATIVE discount on a charge is always
--     recomputed server-side in the checkout route — never trusted from
--     the client.
-- ============================================================


-- ============================================================
-- 0. REPLACE THE LEGACY DRAFT TABLE
-- ------------------------------------------------------------
-- An earlier draft of this file created `offers` with an incompatible shape
-- (title / discount_type / discount_value / min_subtotal / active). Nothing can
-- migrate column-by-column from that to this — the semantics differ — so the
-- draft table is dropped and rebuilt below.
--
-- SAFETY: the drop only happens when the table is unmistakably the legacy one
-- (it has no `name` column) AND it is empty. If it holds even one row this
-- raises and the whole migration aborts in its transaction, changing nothing.
-- Recreating the table with the correct shape then happens in section 1.
--
-- CASCADE is required because 16_order_discounts.sql may already have added
-- `orders.offer_id` with a foreign key into this table. CASCADE drops that FK
-- constraint (it does NOT drop the orders.offer_id column or any order data);
-- section 2 puts the FK back.
--
-- No-ops entirely on a clean database, and on any database already carrying
-- the current schema — so this file stays safe to re-run.
-- ============================================================
do $$
declare
  legacy_rows bigint;
begin
  if to_regclass('public.offers') is null then
    return; -- clean database: nothing to replace
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'offers' and column_name = 'name'
  ) then
    return; -- already the current schema
  end if;

  execute 'select count(*) from public.offers' into legacy_rows;

  if legacy_rows > 0 then
    raise exception
      'Refusing to replace the legacy public.offers table: it holds % row(s). '
      'Export or delete them, then re-run this migration.', legacy_rows;
  end if;

  raise notice 'Dropping the empty legacy public.offers table and rebuilding it.';
  drop table public.offers cascade;
end $$;


-- ============================================================
-- 1. OFFERS
-- ------------------------------------------------------------
--   type            drives which discount columns matter (see lib/offers.ts)
--   enabled         admin on/off switch
--   stackable       runs alongside another active offer instead of competing
--   priority        breaks ties between non-stackable candidates
--   free_delivery   a flag that rides on ANY type, not just 'free_delivery'
--   eligibility_scope  'all' | 'categories' | 'products' — the BASE set;
--                      exclude rules are subtracted from it whatever the scope
--   start_at/end_at    absolute window (NULL => open-ended on that side)
--   time_start/time_end  optional daily window; supports overnight ranges
--   days_of_week    0=Sun..6=Sat; NULL/empty => every day
--
-- There is deliberately NO stored `status` column. "Active right now" is
-- always DERIVED from enabled + the schedule at read time, by
-- isOfferCurrentlyActive() in lib/offers.ts. Do not add a cron that flips a
-- status column — that would create a second, drift-prone source of truth.
-- ============================================================
create table if not exists public.offers (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  type                     text not null default 'custom'
    check (type in ('percentage','fixed_amount','buy_x_get_y','free_delivery','coupon','custom')),
  enabled                  boolean not null default false,
  stackable                boolean not null default false,
  priority                 integer not null default 0,

  -- discount values (which apply depends on `type`)
  percentage_value         numeric(5,2)  check (percentage_value  is null or (percentage_value  >= 0 and percentage_value <= 100)),
  fixed_amount_value       numeric(10,2) check (fixed_amount_value is null or fixed_amount_value >= 0),
  buy_x_quantity           integer       check (buy_x_quantity     is null or buy_x_quantity     > 0),
  get_y_quantity           integer       check (get_y_quantity     is null or get_y_quantity     > 0),
  get_y_discount_percent   numeric(5,2)  not null default 100
    check (get_y_discount_percent >= 0 and get_y_discount_percent <= 100),
  free_delivery            boolean not null default false,
  coupon_code              text,
  coupon_discount_type     text check (coupon_discount_type is null or coupon_discount_type in ('percentage','fixed_amount')),

  -- eligibility
  eligibility_scope        text not null default 'all'
    check (eligibility_scope in ('all','categories','products')),

  -- cart conditions (NULL => no restriction on that axis)
  min_order_amount         numeric(10,2) check (min_order_amount is null or min_order_amount >= 0),
  max_order_amount         numeric(10,2) check (max_order_amount is null or max_order_amount >= 0),
  min_quantity             integer       check (min_quantity     is null or min_quantity     >= 0),
  max_quantity             integer       check (max_quantity     is null or max_quantity     >= 0),

  -- audience
  audience                 text not null default 'everyone'
    check (audience in ('everyone','first_order','new_customer','specific_emails')),
  usage_limit_total        integer check (usage_limit_total        is null or usage_limit_total        >= 0),
  usage_limit_per_customer integer check (usage_limit_per_customer is null or usage_limit_per_customer >= 0),

  -- schedule
  start_at                 timestamptz,
  end_at                   timestamptz,
  time_start               time,
  time_end                 time,
  days_of_week             integer[],

  -- storefront content (carried for banner rendering; no effect on the math)
  announcement_text        text,
  hero_heading             text,
  hero_subtext             text,
  hero_highlight_text      text,
  cta_text                 text,
  cta_link                 text,
  banner_image_url         text,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint offers_window_ordered check (start_at is null or end_at is null or start_at < end_at),
  -- Array containment, not a subquery: CHECK constraints may not contain
  -- subqueries, so `unnest(...)` is not an option here. An empty array is
  -- contained by any array, which is the "every day" case.
  constraint offers_days_of_week_valid check (
    days_of_week is null or days_of_week <@ array[0,1,2,3,4,5,6]
  )
);

-- Section 0 guarantees the table above is either brand new or already exactly
-- this shape, so no `add column if not exists` back-fill is needed here.


-- ============================================================
-- 2. RE-ATTACH orders.offer_id → offers(id)
-- ------------------------------------------------------------
-- 16_order_discounts.sql adds `orders.offer_id` with this FK. If that file ran
-- first, section 0's CASCADE just dropped the constraint (the column and all
-- order rows survive untouched) — so put it back. If 16 hasn't run yet, the
-- column doesn't exist and this no-ops; 16 will then create the FK itself.
--
-- ON DELETE SET NULL matches 16_order_discounts.sql: deleting an offer must
-- never delete the orders that used it.
-- ============================================================
do $$
declare
  offer_id_attnum smallint;
begin
  select attnum into offer_id_attnum
  from pg_attribute
  where attrelid = 'public.orders'::regclass and attname = 'offer_id' and not attisdropped;

  if offer_id_attnum is null then
    return; -- 16_order_discounts.sql hasn't run yet; it will create the FK
  end if;

  -- Match ANY foreign key on orders(offer_id), whatever it happens to be
  -- named, so a re-run can never stack a second identical constraint.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'f'
      and conkey = array[offer_id_attnum]
  ) then
    alter table public.orders
      add constraint orders_offer_id_fkey
      foreign key (offer_id) references public.offers(id) on delete set null;
  end if;
end $$;


-- ============================================================
-- 3. CHILD TABLES
-- ------------------------------------------------------------
-- Eligibility is "base set, then subtract exclusions" (see isProductEligible
-- in lib/offers.ts):
--   scope='all'        -> every product
--   scope='categories' -> product.category IN (include category rules)
--   scope='products'   -> product.id       IN (include product rules)
-- then, WHATEVER the scope, remove any product matched by an exclude rule.
--
-- products.category is flat text (no categories table), so category rules
-- store the text, not an FK.
-- ============================================================
create table if not exists public.offer_category_rules (
  id       uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  category text not null,
  mode     text not null default 'include' check (mode in ('include','exclude')),
  unique (offer_id, category, mode)
);

create table if not exists public.offer_product_rules (
  id         uuid primary key default gen_random_uuid(),
  offer_id   uuid not null references public.offers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  mode       text not null default 'include' check (mode in ('include','exclude')),
  unique (offer_id, product_id, mode)
);

-- Private: the allowlist for audience='specific_emails'. Never anon-readable.
create table if not exists public.offer_emails (
  id       uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  email    text not null,
  unique (offer_id, email)
);

-- Private: one row per redeemed offer, written best-effort after an order is
-- saved. Powers usage limits and analytics.
create table if not exists public.offer_redemptions (
  id              uuid primary key default gen_random_uuid(),
  offer_id        uuid not null references public.offers(id) on delete cascade,
  order_id        uuid references public.orders(id) on delete set null,
  email           text,
  discount_amount numeric(10,2) not null default 0,
  created_at      timestamptz not null default now()
);


-- ============================================================
-- 4. INDEXES
-- ============================================================
create index if not exists idx_offers_enabled  on public.offers(enabled);
create index if not exists idx_offers_type     on public.offers(type);
create index if not exists idx_offers_window   on public.offers(start_at, end_at);
create index if not exists idx_offers_created  on public.offers(created_at desc);

-- One coupon code at a time, case-insensitively. Auto-applied offers
-- (coupon_code IS NULL) are exempt.
create unique index if not exists uniq_offers_coupon_code
  on public.offers (lower(coupon_code)) where coupon_code is not null;

create index if not exists idx_offer_category_rules_offer on public.offer_category_rules(offer_id);
create index if not exists idx_offer_product_rules_offer  on public.offer_product_rules(offer_id);
create index if not exists idx_offer_emails_offer         on public.offer_emails(offer_id);
create index if not exists idx_offer_emails_email         on public.offer_emails(lower(email));
create index if not exists idx_offer_redemptions_offer    on public.offer_redemptions(offer_id);
create index if not exists idx_offer_redemptions_email    on public.offer_redemptions(lower(email));


-- ============================================================
-- 5. EXCLUSION CONSTRAINT — at most one auto-applied non-stackable offer
--    live in any given window.
-- ------------------------------------------------------------
-- Scoped to `type <> 'coupon'` on purpose. Coupons never auto-apply and never
-- drive the storefront banner — they are entered by code at checkout — so a
-- coupon must not lock out the site-wide banner offer. Without this predicate,
-- creating a single non-stackable coupon would make every other non-stackable
-- offer unsaveable for the same window.
--
-- Violations raise SQLSTATE 23P01, which isExclusionViolation() in
-- lib/offers-admin.ts turns into a friendly 409.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'one_active_non_stackable_offer'
      and conrelid = 'public.offers'::regclass
  ) then
    alter table public.offers
      add constraint one_active_non_stackable_offer
      exclude using gist (
        tstzrange(
          coalesce(start_at, '-infinity'::timestamptz),
          coalesce(end_at,    'infinity'::timestamptz)
        ) with &&
      )
      where (enabled and not stackable and type <> 'coupon');
  end if;
end $$;


-- ============================================================
-- 6. TRIGGER (keep updated_at fresh — reuses set_updated_at from 00_full_setup)
-- ============================================================
drop trigger if exists trg_offers_updated on public.offers;
create trigger trg_offers_updated before update on public.offers
  for each row execute function public.set_updated_at();


-- ============================================================
-- 7. validate_coupon(code)
-- ------------------------------------------------------------
-- SECURITY DEFINER so it can see coupon rows that RLS hides from anon. Returns
-- the full offer row (or nothing) — the caller
-- (/api/offers/validate-coupon) then runs the SAME lib/offers.ts schedule /
-- condition / discount checks the checkout uses, so a code can never preview a
-- discount the checkout wouldn't grant.
--
-- Deliberately does NOT check the schedule or cart conditions itself: the
-- route needs to distinguish "no such code" from "real code, conditions not
-- met" so it can return a specific reason instead of a bare "invalid".
--
-- The parameter MUST stay named `code`: PostgREST maps the JSON body key of
-- POST /rest/v1/rpc/validate_coupon onto the named argument. It is referenced
-- as $1 rather than by name so it can never be ambiguous against a column of
-- the same name (the legacy draft table had a `code` column, and a bare `code`
-- would then fail to resolve).
-- ============================================================
create or replace function public.validate_coupon(code text)
returns setof public.offers
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.*
  from public.offers o
  where o.type = 'coupon'
    and o.enabled
    and o.coupon_code is not null
    and lower(o.coupon_code) = lower(btrim($1))
  limit 1;
$$;

revoke all on function public.validate_coupon(text) from public;
grant execute on function public.validate_coupon(text) to anon, authenticated, service_role;


-- ============================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================
alter table public.offers              enable row level security;
alter table public.offer_category_rules enable row level security;
alter table public.offer_product_rules  enable row level security;
alter table public.offer_emails         enable row level security;
alter table public.offer_redemptions    enable row level security;

-- Offers: anon sees enabled, non-coupon offers. Coupons stay invisible so they
-- cannot be enumerated; they resolve only through validate_coupon() above.
-- Whether an offer is active *right now* is still decided in code from the
-- schedule — this policy only gates what's readable at all.
drop policy if exists "Public read active offers" on public.offers;
drop policy if exists "Public read enabled non-coupon offers" on public.offers;
create policy "Public read enabled non-coupon offers"
  on public.offers for select
  using (enabled = true and type <> 'coupon');

-- Rule tables: anon-readable for every offer, including coupons — the coupon
-- preview needs them to resolve eligibility once validate_coupon() has already
-- proven the caller knows the code. They expose category names and product ids
-- that are public anyway.
drop policy if exists "Public read offer category rules" on public.offer_category_rules;
create policy "Public read offer category rules"
  on public.offer_category_rules for select using (true);

drop policy if exists "Public read offer product rules" on public.offer_product_rules;
create policy "Public read offer product rules"
  on public.offer_product_rules for select using (true);

-- offer_emails and offer_redemptions get NO policies at all: with RLS enabled
-- and no permissive policy, anon and authenticated are denied every operation.
-- The service role bypasses RLS and is the only writer/reader.


-- ============================================================
-- DONE. Reload the PostgREST schema cache so the new tables and the RPC are
-- queryable immediately:
--   notify pgrst, 'reload schema';
-- ============================================================
notify pgrst, 'reload schema';
