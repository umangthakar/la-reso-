-- ============================================================
-- Le Rasa Bakery — 16_order_discounts.sql
-- ------------------------------------------------------------
-- Records the offer / coupon discount applied to a paid order, so the admin
-- Orders view and the customer's confirmation can show it, and so the
-- offer_redemptions ledger has a home for the amount.
--
-- ADDITIVE ONLY — same `add column if not exists` guard pattern used
-- throughout 00_full_setup.sql. Safe to run repeatedly. Orders still save on
-- a DB that hasn't had this applied yet (the API falls back via
-- isMissingColumn()), so applying this is not urgent, just completes the data.
-- ============================================================

alter table public.orders
  add column if not exists discount_amount numeric(10,2) not null default 0;

alter table public.orders
  add column if not exists coupon_code text;

alter table public.orders
  add column if not exists offer_id uuid references public.offers(id) on delete set null;

-- Reload the PostgREST schema cache so the new columns are queryable at once.
notify pgrst, 'reload schema';
