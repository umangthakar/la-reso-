-- ============================================================
-- LE RASA BAKERY — Per-product Nutrition Information.
-- ------------------------------------------------------------
-- Paste-and-run in the Supabase SQL Editor. Fully IDEMPOTENT and
-- ADDITIVE — safe to run repeatedly and safe on the live database
-- without touching existing products, orders or checkout.
--
-- Adds a single nullable jsonb column to products. Existing products
-- get NULL (no nutrition), so nothing new is shown for them and the
-- storefront + admin degrade gracefully when this migration hasn't been
-- run (the API swallows "column does not exist"). Nutrition is entirely
-- optional and never required to save a product.
--
-- Shape of the stored value (all values are strings, all keys optional):
--   {
--     "energy_kj":    { "per_100g": "1455.1", "per_portion": "1446.0" },
--     "energy_kcal":  { "per_100g": "348.1",  "per_portion": "345.9"  },
--     "fat":          { ... }, "saturates":   { ... },
--     "carbohydrate": { ... }, "sugars":      { ... },
--     "protein":      { ... }, "salt":        { ... },
--     "fibre":        { ... }
--   }
-- ============================================================

alter table public.products
  add column if not exists nutrition jsonb;

-- Public read is already covered by the existing products SELECT policy
-- (the storefront reads this column with the anon client). All writes go
-- through the service-role admin API, which bypasses RLS. No new table,
-- policy or index is required.
