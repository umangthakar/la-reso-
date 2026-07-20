-- ============================================================
-- LE RASA BAKERY — Ingredients upgrade: rich-text description + icons.
-- ------------------------------------------------------------
-- Paste-and-run in the Supabase SQL Editor. Fully IDEMPOTENT and
-- ADDITIVE — safe to run repeatedly and safe on the live database
-- without touching existing products, orders or checkout.
--
-- Nothing here is required for the storefront to keep working: the
-- admin API + frontend degrade gracefully when these columns are
-- absent (best-effort, migration-tolerant), so old products with only
-- the plain `ingredients` tag list continue to work exactly as before.
--
--   1. products.ingredients_rich   (text — sanitized rich HTML, bold, etc.)
--   2. products.ingredient_icons   (jsonb array of icon keys, e.g. ["milk"])
-- ============================================================


-- ------------------------------------------------------------
-- 1. RICH-TEXT INGREDIENTS DESCRIPTION
--    Sanitized HTML authored in the admin panel. NULL / empty means the
--    product falls back to its existing `ingredients` tag list (if any),
--    so this is fully backward compatible.
-- ------------------------------------------------------------
alter table public.products
  add column if not exists ingredients_rich text;


-- ------------------------------------------------------------
-- 2. INGREDIENT ICONS
--    An ordered jsonb array of icon KEYS (see lib/ingredient-icons.ts),
--    e.g. ["milk","wheat","chocolate"]. Default '[]' so existing rows read
--    back as "no icons" and the storefront simply shows none.
--    NOTE: these are INGREDIENT icons, NOT allergen icons — the Allergens
--    field/UI is untouched.
-- ------------------------------------------------------------
alter table public.products
  add column if not exists ingredient_icons jsonb not null default '[]'::jsonb;
