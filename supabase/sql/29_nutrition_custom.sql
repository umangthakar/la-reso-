-- ============================================================
-- LE RASA BAKERY — Custom (admin-defined) Nutrition rows.
-- ------------------------------------------------------------
-- Paste-and-run in the Supabase SQL Editor. Fully IDEMPOTENT and
-- ADDITIVE — safe to run repeatedly and safe on the live database
-- without touching existing products, orders or the default nutrition
-- values added by 28_nutrition.sql.
--
-- Adds ONE more nullable jsonb column, kept SEPARATE from the fixed
-- default rows in products.nutrition so those are never modified.
-- Existing products get NULL (no custom rows) and keep working; the API
-- swallows "column does not exist" so nothing breaks before this runs.
--
-- Shape of the stored value (ordered array; values are free text so units
-- like "mg" survive; empty => stored as NULL):
--   [
--     { "id": "nc_x1", "label": "Vitamin C", "per_100g": "25mg", "per_portion": "18mg" },
--     { "id": "nc_x2", "label": "Calcium",   "per_100g": "120mg", "per_portion": "95mg" }
--   ]
-- ============================================================

alter table public.products
  add column if not exists nutrition_custom jsonb;

-- Public read is already covered by the existing products SELECT policy
-- (the storefront reads this column with the anon client). All writes go
-- through the service-role admin API, which bypasses RLS. No new table,
-- policy or index is required.
