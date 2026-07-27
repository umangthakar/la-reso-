-- ============================================================
-- Le Rasa Bakery — 37_hero_slider_product.sql
-- ------------------------------------------------------------
-- Links every Hero Slider image to a product, so the hero's "Order Now" opens
-- the cake the visitor is actually looking at instead of the whole menu.
--
-- ONE COLUMN, NOT A COPY. The hero stores a REFERENCE to products.id and
-- nothing else — no name, no price, no image, no slug. The product table stays
-- the single source of truth: renaming a cake in /admin/dashboard/products
-- changes what the hero links to on the next request, with nothing to keep in
-- step and nothing that can drift.
--
-- WHY id AND NOT sku OR slug. products has neither column. The storefront's
-- product URLs are DERIVED from the name (lib/slug.ts — /menu/<slugify(name)>),
-- so a slug column would be a second source of truth for something already
-- computed, and it would go stale the moment a product were renamed. The id is
-- the only stable identity the table has, so it is what the hero holds; the
-- href is resolved from the joined name at read time.
--
-- ON DELETE SET NULL, deliberately, and not CASCADE. Deleting a product must
-- not delete hero artwork: the image, its position and its visibility are the
-- bakery's, and losing them because a cake was discontinued would be a
-- surprising amount of collateral damage. The link simply goes empty, the admin
-- sees "No product linked" on that row, and Order Now falls back to /menu until
-- a new product is chosen.
--
-- NULLABLE. Existing rows predate this column and every one of them would fail
-- a NOT NULL, so the column is nullable and the requirement that every image be
-- linked is enforced where it can be enforced kindly — the upload form makes
-- the product a required field, and the admin list flags any row still unlinked.
--
-- IDEMPOTENT and PURELY ADDITIVE: one ADD COLUMN IF NOT EXISTS and one index.
-- 36_hero_slider.sql is not modified. Safe to run repeatedly.
-- ============================================================


-- ============================================================
-- 1. THE LINK
-- ------------------------------------------------------------
-- Guarded by an IF NOT EXISTS on the constraint as well as the column: the
-- column can already exist from a partial run, in which case ADD COLUMN is a
-- no-op and the foreign key would otherwise never be attached.
-- ============================================================
alter table public.hero_slider_images
  add column if not exists product_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'hero_slider_images_product_id_fkey'
      and conrelid = 'public.hero_slider_images'::regclass
  ) then
    alter table public.hero_slider_images
      add constraint hero_slider_images_product_id_fkey
      foreign key (product_id) references public.products (id) on delete set null;
  end if;
end $$;


-- ============================================================
-- 2. INDEX
-- ------------------------------------------------------------
-- Postgres does NOT index a foreign key automatically, and this one is read on
-- the referenced side as well as the referencing one: every DELETE of a product
-- has to find the hero rows pointing at it to null them out, which without an
-- index is a sequential scan of this table per deleted product.
--
-- Partial (product_id is not null) because the rows that matter to both the
-- join and the cascade are the linked ones — an unlinked row is never looked up
-- by this column.
-- ============================================================
create index if not exists idx_hero_slider_product
  on public.hero_slider_images (product_id)
  where product_id is not null;


-- ============================================================
-- 3. RLS — nothing to change, and that is worth stating.
-- ------------------------------------------------------------
-- The existing "Public read visible hero slider images" policy is a row filter
-- (visible = true); it does not enumerate columns, so it already covers
-- product_id. The storefront EMBEDS the product through this key
-- (lib/hero-slider-server.ts), and that embed is evaluated under the products
-- table's OWN policy — "Public read visible products". So a hero image linked
-- to a hidden or deleted product resolves to no product at all rather than
-- leaking one, without this module needing a rule of its own.
-- ============================================================


-- ============================================================
-- DONE. Reload the PostgREST schema cache — required here rather than merely
-- tidy: PostgREST resolves embeds from its cached view of the foreign keys, so
-- until it reloads, `products(...)` on this table is an unknown relationship
-- and the storefront read fails.
-- ============================================================
notify pgrst, 'reload schema';
