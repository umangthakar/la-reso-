-- ============================================================
-- 09_categories.sql — persisted, admin-managed category list
--
-- Categories were previously derived only from products.category, so an
-- "empty" category (0 products) could not exist. This column stores the
-- ordered list the admin manages (add / rename / delete), including
-- categories that don't yet have any products. The storefront menu tabs
-- and the admin Categories panel show the UNION of this list and any
-- distinct products.category values.
--
-- Safe to run more than once.
-- ============================================================

-- Seeded with the original six categories so existing installs get a sensible
-- starting list (adding a column with a DEFAULT backfills the existing row).
-- Matches the definition in 00_full_setup.sql.
alter table public.site_settings
  add column if not exists categories jsonb not null default
    '["Birthday Cakes","Cupcakes","Custom Cakes","Brownies","Cookies","Gift Boxes"]'::jsonb;
