-- ============================================================
-- LE RASA BAKERY — Product enrichment: ingredients, multiple
-- images, and size variants.
-- ------------------------------------------------------------
-- Paste-and-run in the Supabase SQL Editor. Fully IDEMPOTENT and
-- ADDITIVE — safe to run repeatedly and safe to run on the live
-- database without touching existing products, orders or checkout.
--
-- Nothing here is required for the storefront to keep working: the
-- admin API + frontend degrade gracefully when these objects are
-- absent, so old single-image, no-size, no-ingredient products
-- continue to function exactly as before.
--
--   1. products.ingredients  (jsonb array of strings)
--   2. product_images         (gallery — many per product)
--   3. product_sizes          (size variants — many per product)
--   4. RLS (public read) + indexes
-- ============================================================


-- ------------------------------------------------------------
-- 1. INGREDIENTS — a simple ordered list of strings on the product.
--    jsonb default '[]' so existing rows read back as an empty list
--    and the frontend only renders the block when it is non-empty.
-- ------------------------------------------------------------
alter table public.products
  add column if not exists ingredients jsonb not null default '[]'::jsonb;


-- ------------------------------------------------------------
-- 2. PRODUCT IMAGES — gallery of images for a product.
--    The product's own `image_url` stays the canonical PRIMARY image
--    (every existing card query reads it), and is mirrored here as the
--    row with is_primary = true. Old products with no rows here simply
--    show their single image_url.
-- ------------------------------------------------------------
create table if not exists public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  url         text not null,
  sort_order  integer not null default 0,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists product_images_product_idx
  on public.product_images (product_id, sort_order);


-- ------------------------------------------------------------
-- 3. PRODUCT SIZES — size variants (Small / Medium / Large …).
--    `price` is the ABSOLUTE price for that size (not a delta), and the
--    server re-prices the basket from it at checkout so Stripe always
--    charges the selected size. `serves` is the serving count shown to
--    the customer. Products with no rows here keep their single price.
-- ------------------------------------------------------------
create table if not exists public.product_sizes (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  label       text not null,                 -- e.g. "Small", "Medium"
  serves      integer,                        -- e.g. 8, 14, 20 (nullable)
  price       numeric(10,2) not null default 0,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists product_sizes_product_idx
  on public.product_sizes (product_id, sort_order);


-- ------------------------------------------------------------
-- 4. ROW LEVEL SECURITY — public (anon) read, matching the storefront
--    access model. All writes go through the service-role admin API,
--    which bypasses RLS. Read is open (true) because these carry only
--    image URLs and size/price info already shown on the storefront.
-- ------------------------------------------------------------
alter table public.product_images enable row level security;
alter table public.product_sizes  enable row level security;

drop policy if exists "Public read product images" on public.product_images;
create policy "Public read product images"
  on public.product_images for select
  using (true);

drop policy if exists "Public read product sizes" on public.product_sizes;
create policy "Public read product sizes"
  on public.product_sizes for select
  using (true);


-- ------------------------------------------------------------
-- 5. REALTIME (optional) — add to the supabase_realtime publication so
--    admin gallery/size edits can push to any listeners. Guarded so it
--    is a no-op when the publication or table membership already exists.
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'product_images'
    ) then
      alter publication supabase_realtime add table public.product_images;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'product_sizes'
    ) then
      alter publication supabase_realtime add table public.product_sizes;
    end if;
  end if;
end $$;
