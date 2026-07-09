-- ============================================================
-- Le Rasa Bakery — 15_offers.sql
-- ------------------------------------------------------------
-- Adds the `offers` table: admin-managed discount offers that can be
-- shown on the storefront (product cards / hero banner) and applied to
-- the basket at checkout.
--
-- ADDITIVE ONLY — this file NEVER edits already-shipped tables in place.
-- It creates one new table with its own indexes, trigger and RLS.
-- Fully IDEMPOTENT: safe to run repeatedly (IF NOT EXISTS,
-- DROP POLICY IF EXISTS, guarded blocks) — same conventions as
-- 00_full_setup.sql.
--
-- Public (anon) rule mirrors `products`: read ACTIVE offers only.
-- The admin panel uses the SERVICE ROLE key server-side, which BYPASSES
-- RLS entirely for full read/write. The AUTHORITATIVE discount applied to
-- a charge is always recomputed server-side in the checkout route from the
-- offer rows read here — never trusted from the client.
-- ============================================================


-- ============================================================
-- 1. TABLE
-- ------------------------------------------------------------
--   discount_type  'percentage' => discount_value is a percent (0–100)
--                  'fixed'      => discount_value is a £ amount
--   min_subtotal   basket must reach this (£) before the offer applies
--   code           optional promo code; NULL => auto-applied offer
--   starts_at/ends_at  optional schedule window (NULL => open-ended)
--   active         admin on/off switch (RLS gate for public read)
-- ============================================================
create table if not exists public.offers (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text,
  discount_type  text not null default 'percentage'
    check (discount_type in ('percentage','fixed')),
  discount_value numeric(10,2) not null default 0 check (discount_value >= 0),
  min_subtotal   numeric(10,2) not null default 0 check (min_subtotal >= 0),
  code           text,
  active         boolean not null default true,
  starts_at      timestamptz,
  ends_at        timestamptz,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Additive guards so re-running on an existing offers table is safe.
alter table public.offers add column if not exists description    text;
alter table public.offers add column if not exists min_subtotal   numeric(10,2) not null default 0;
alter table public.offers add column if not exists code           text;
alter table public.offers add column if not exists starts_at      timestamptz;
alter table public.offers add column if not exists ends_at        timestamptz;
alter table public.offers add column if not exists sort_order     integer not null default 0;
alter table public.offers add column if not exists updated_at     timestamptz not null default now();


-- ============================================================
-- 2. INDEXES
-- ============================================================
create index if not exists idx_offers_active     on public.offers(active);
create index if not exists idx_offers_sort_order  on public.offers(sort_order);
create index if not exists idx_offers_created     on public.offers(created_at desc);

-- One live promo code at a time (case-insensitive). Only enforced for rows
-- that actually carry a code; auto-applied offers (code IS NULL) are exempt.
create unique index if not exists uniq_offers_code
  on public.offers (lower(code)) where code is not null;


-- ============================================================
-- 3. TRIGGER  (keep updated_at fresh — reuses set_updated_at from 00_full_setup)
-- ============================================================
drop trigger if exists trg_offers_updated on public.offers;
create trigger trg_offers_updated before update on public.offers
  for each row execute function public.set_updated_at();


-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ------------------------------------------------------------
-- Public can read ACTIVE offers only (same shape as the products policy).
-- No INSERT/UPDATE/DELETE policies => those are denied to anon/authenticated;
-- the admin panel writes with the service role, which bypasses RLS.
-- ============================================================
alter table public.offers enable row level security;

drop policy if exists "Public read active offers" on public.offers;
create policy "Public read active offers"
  on public.offers for select
  using (active = true);


-- ============================================================
-- DONE. Reload the PostgREST schema cache if columns look missing:
--   notify pgrst, 'reload schema';
-- ============================================================
notify pgrst, 'reload schema';
