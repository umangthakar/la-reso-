-- ============================================================
-- LE RASA BAKERY — add delivery_date to orders
-- Run ONCE in the Supabase SQL Editor. Idempotent.
-- The admin Orders page displays this column; it's populated when an
-- order is created (e.g. by the order form), not edited by the admin.
-- ============================================================

alter table orders add column if not exists delivery_date date;
