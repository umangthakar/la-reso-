-- ============================================================
-- LE RASA BAKERY — COMPLETE SUPABASE SETUP (single script)
-- ------------------------------------------------------------
-- Paste-and-run in the Supabase SQL Editor for the NEW project.
-- Fully IDEMPOTENT: safe to run repeatedly (IF NOT EXISTS,
-- ON CONFLICT DO NOTHING, DROP POLICY IF EXISTS, guarded blocks).
--
-- Schema is derived from what the CODE actually reads/writes
-- (admin API routes + storefront), NOT the older 01–08 migration
-- files, which had diverged from the live database.
--
-- Sections:
--   1. Extensions
--   2. Tables (products, delivery_zones, orders, order_items,
--      order_status_history, site_settings)
--   3. Indexes
--   4. Triggers (updated_at, status history)
--   5. Row Level Security policies
--   6. Realtime publication
--   7. Storage buckets + policies
--   8. Seed data (site_settings, delivery_zones, products)
-- ============================================================


-- ============================================================
-- 1. EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";   -- gen_random_bytes() for tracking tokens


-- ============================================================
-- 2. TABLES
-- ============================================================

-- ------------------------------------------------------------
-- PRODUCTS  (storefront catalogue + admin management)
-- Columns match the admin Products API + storefront menu grid:
--   id, name, category, description, price, badge, image_url,
--   in_stock, visible, allergens, sort_order, created_at
-- ------------------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text,                       -- flat text (no categories FK)
  description text,
  price       numeric(10,2) not null default 0,
  badge       text,                       -- e.g. "Bestseller", "New"
  image_url   text,
  in_stock    boolean not null default true,
  visible     boolean not null default true,   -- hide from storefront w/o deleting
  allergens   text,                       -- free text, e.g. "Contains nuts, gluten"
  sort_order  integer not null default 0, -- admin drag-to-reorder
  created_at  timestamptz not null default now()
);

-- Older/other columns are additive no-ops if the table already exists.
alter table public.products add column if not exists category   text;
alter table public.products add column if not exists badge      text;
alter table public.products add column if not exists image_url  text;
alter table public.products add column if not exists visible    boolean not null default true;
alter table public.products add column if not exists allergens  text;
alter table public.products add column if not exists sort_order integer not null default 0;

-- ------------------------------------------------------------
-- DELIVERY ZONES  (analytics labels + storefront delivery costs)
-- ------------------------------------------------------------
create table if not exists public.delivery_zones (
  id                      uuid primary key default gen_random_uuid(),
  zone_name               text not null,
  postcode_pattern        text,
  price                   numeric(10,2) not null default 0,
  free_delivery_threshold numeric(10,2),
  active                  boolean not null default true,
  created_at              timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ORDERS  (enquiry-origin shape + money + Stripe columns)
-- The admin Orders / Dashboard / Analytics / Refunds pages read:
--   id, customer_name, email, phone, message, status, created_at,
--   delivery_date, subtotal, delivery_charge, total, zone_id,
--   amount, stripe_payment_intent, refunded_at
-- tracking_token/updated_at support future customer tracking.
-- ------------------------------------------------------------
create table if not exists public.orders (
  id                     uuid primary key default gen_random_uuid(),
  tracking_token         text not null unique default encode(gen_random_bytes(16), 'hex'),

  -- contact / enquiry fields
  customer_name          text,
  email                  text,
  phone                  text,
  message                text,

  -- delivery address (from the customer checkout flow)
  delivery_address       text,
  postcode               text,
  special_instructions   text,

  -- fulfilment
  status                 text not null default 'received'
    check (status in ('received','preparing','out_for_delivery','delivered','cancelled','refunded')),
  delivery_date          date,
  zone_id                uuid references public.delivery_zones(id) on delete set null,

  -- money
  subtotal               numeric(10,2) not null default 0,
  delivery_charge        numeric(10,2) not null default 0,
  total                  numeric(10,2) not null default 0,
  amount                 numeric(10,2),   -- amount charged, used by refunds tool

  -- payment
  payment_method         text,            -- e.g. 'stripe'
  stripe_payment_intent  text,
  refunded_at            timestamptz,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Additive guards so re-running on an existing orders table is safe.
alter table public.orders add column if not exists tracking_token        text;
alter table public.orders add column if not exists message               text;
alter table public.orders add column if not exists delivery_address      text;
alter table public.orders add column if not exists postcode              text;
alter table public.orders add column if not exists special_instructions  text;
alter table public.orders add column if not exists payment_method        text;
alter table public.orders add column if not exists delivery_date         date;
alter table public.orders add column if not exists zone_id               uuid references public.delivery_zones(id) on delete set null;
alter table public.orders add column if not exists subtotal              numeric(10,2) not null default 0;
alter table public.orders add column if not exists delivery_charge       numeric(10,2) not null default 0;
alter table public.orders add column if not exists total                 numeric(10,2) not null default 0;
alter table public.orders add column if not exists amount                numeric(10,2);
alter table public.orders add column if not exists stripe_payment_intent text;
alter table public.orders add column if not exists refunded_at           timestamptz;
alter table public.orders add column if not exists updated_at            timestamptz not null default now();

-- ------------------------------------------------------------
-- ORDER ITEMS  (line items — drives "top products" reporting)
-- ------------------------------------------------------------
create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  product_name text not null,             -- snapshot, survives product edits/deletes
  unit_price   numeric(10,2) not null default 0,
  quantity     integer not null default 1 check (quantity > 0),
  line_total   numeric(10,2) not null default 0
);

-- ------------------------------------------------------------
-- ORDER STATUS HISTORY  (future customer tracking page + emails)
-- Referenced by the realtime tracking hook; populated by trigger.
-- ------------------------------------------------------------
create table if not exists public.order_status_history (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  status     text not null,
  note       text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- SITE SETTINGS  (singleton row id = 1)
-- Every key the admin Settings / Delivery / Payments / Content
-- pages and the public announcement bar read or write.
-- ------------------------------------------------------------
create table if not exists public.site_settings (
  id                integer primary key default 1,

  -- content & contact
  site_name         text default 'Le Rasa Bakery',
  tagline           text default 'Eggless cakes, baked with love',
  phone             text,
  email             text,
  address           text,
  whatsapp          text,
  active_theme      text,

  -- social
  instagram_url     text,
  facebook_url      text,
  tiktok_url        text,

  -- homepage hero
  hero_tagline      text,
  hero_button_text  text default 'Order Now',
  hero_image_url    text,

  -- about page
  about_story       text,
  about_image_url   text,

  -- announcement bar: { "enabled": bool, "text": "..." }
  announcement      jsonb not null default '{"enabled": false, "text": ""}'::jsonb,

  -- menu hero banner: { "enabled": bool, "heading": "...", "subtext": "..." }
  hero_banner       jsonb not null default '{"enabled": true, "heading": "Every Bite, Eggless & Divine", "subtext": "Handcrafted fresh daily — pick your craving"}'::jsonb,

  -- delivery settings
  delivery_zones    jsonb   not null default '[]'::jsonb,
  lead_time_days    integer not null default 3,
  blocked_dates     jsonb   not null default '[]'::jsonb,
  delivery_days     jsonb   not null default
    '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]'::jsonb,
  daily_order_cap   integer,

  -- payments: { publishable_key, secret_key_enc, mode } (secret encrypted at rest)
  stripe_config     jsonb,

  updated_at        timestamptz not null default now(),
  constraint site_settings_singleton check (id = 1)
);

-- Additive guards so re-running on an existing site_settings row is safe.
alter table public.site_settings add column if not exists site_name        text default 'Le Rasa Bakery';
alter table public.site_settings add column if not exists tagline          text default 'Eggless cakes, baked with love';
alter table public.site_settings add column if not exists whatsapp         text;
alter table public.site_settings add column if not exists active_theme     text;
alter table public.site_settings add column if not exists instagram_url    text;
alter table public.site_settings add column if not exists facebook_url     text;
alter table public.site_settings add column if not exists tiktok_url       text;
alter table public.site_settings add column if not exists hero_tagline     text;
alter table public.site_settings add column if not exists hero_button_text text default 'Order Now';
alter table public.site_settings add column if not exists hero_image_url   text;
alter table public.site_settings add column if not exists about_story      text;
alter table public.site_settings add column if not exists about_image_url  text;
alter table public.site_settings add column if not exists announcement     jsonb not null default '{"enabled": false, "text": ""}'::jsonb;
-- menu hero banner: { "enabled": bool, "heading": "...", "subtext": "..." }
alter table public.site_settings add column if not exists hero_banner      jsonb not null default '{"enabled": true, "heading": "Every Bite, Eggless & Divine", "subtext": "Handcrafted fresh daily — pick your craving"}'::jsonb;
-- menu WhatsApp bar: { "enabled": bool, "text": "...", "number": "441234567890" }
alter table public.site_settings add column if not exists whatsapp_bar     jsonb not null default '{"enabled": true, "text": "For any question", "number": "441234567890"}'::jsonb;
alter table public.site_settings add column if not exists delivery_zones   jsonb not null default '[]'::jsonb;
alter table public.site_settings add column if not exists lead_time_days   integer not null default 3;
alter table public.site_settings add column if not exists blocked_dates    jsonb not null default '[]'::jsonb;
alter table public.site_settings add column if not exists delivery_days    jsonb not null default
  '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]'::jsonb;
alter table public.site_settings add column if not exists daily_order_cap  integer;
alter table public.site_settings add column if not exists stripe_config    jsonb;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS categories jsonb DEFAULT '["Birthday Cakes","Cupcakes","Custom Cakes","Brownies","Cookies","Gift Boxes"]'::jsonb;

-- ------------------------------------------------------------
-- PROFILES  (customer accounts — one row per authenticated user)
-- Populated by the /account/complete-profile page after Google login.
-- default_address jsonb: { line1, street, city, postcode }.
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  first_name      text,
  last_name       text,
  phone           text,
  default_address jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);


-- ============================================================
-- 3. INDEXES  (fast lookups: category, status, created_at, email)
-- ============================================================
create index if not exists idx_products_category    on public.products(category);
create index if not exists idx_products_visibility   on public.products(visible, in_stock);
create index if not exists idx_products_sort_order   on public.products(sort_order);
create index if not exists idx_products_created      on public.products(created_at desc);

create index if not exists idx_orders_status         on public.orders(status);
create index if not exists idx_orders_created        on public.orders(created_at desc);
create index if not exists idx_orders_email          on public.orders(email);
create index if not exists idx_orders_zone           on public.orders(zone_id);
create index if not exists idx_orders_delivery_date  on public.orders(delivery_date);

create index if not exists idx_order_items_order     on public.order_items(order_id);
create index if not exists idx_order_items_product   on public.order_items(product_id);

create index if not exists idx_status_history_order  on public.order_status_history(order_id, created_at desc);

create index if not exists idx_delivery_zones_active on public.delivery_zones(active);


-- ============================================================
-- 4. TRIGGERS
-- ============================================================

-- Keep updated_at fresh on products / orders / site_settings.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_orders_updated on public.orders;
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists trg_site_settings_updated on public.site_settings;
create trigger trg_site_settings_updated before update on public.site_settings
  for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-log a row into order_status_history whenever an order's status
-- changes (and on insert) — powers the tracking page without app code.
create or replace function public.log_order_status_change()
returns trigger as $$
begin
  if (tg_op = 'INSERT') or (old.status is distinct from new.status) then
    insert into public.order_status_history (order_id, status)
    values (new.id, new.status);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_order_status_log on public.orders;
create trigger trg_order_status_log after insert or update on public.orders
  for each row execute function public.log_order_status_change();


-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ------------------------------------------------------------
-- Public (anon) rules:
--   * READ products (only visible ones) and site_settings
--   * READ active delivery_zones
--   * INSERT orders + order_items (checkout — guest allowed)
-- No UPDATE/DELETE policies are defined, so those are denied to
-- anon/authenticated. The admin panel uses the SERVICE ROLE key
-- server-side, which BYPASSES RLS entirely for full read/write.
-- ============================================================
alter table public.products             enable row level security;
alter table public.delivery_zones       enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_status_history enable row level security;
alter table public.site_settings        enable row level security;

-- PRODUCTS — public can read visible products only (storefront relies on
-- this: the menu query filters in_stock but NOT visible, so RLS enforces it).
drop policy if exists "Public read visible products" on public.products;
create policy "Public read visible products"
  on public.products for select
  using (visible = true);

-- SITE SETTINGS — public read (announcement bar uses the anon key).
-- NOTE: stripe_config lives here; its secret key is encrypted at rest,
-- but consider moving payment config to a private table long-term.
drop policy if exists "Public read site settings" on public.site_settings;
create policy "Public read site settings"
  on public.site_settings for select
  using (true);

-- DELIVERY ZONES — public read active zones only.
drop policy if exists "Public read active delivery zones" on public.delivery_zones;
create policy "Public read active delivery zones"
  on public.delivery_zones for select
  using (active = true);

-- ORDERS — anyone can create an order (checkout / enquiry form).
drop policy if exists "Anyone can create an order" on public.orders;
create policy "Anyone can create an order"
  on public.orders for insert
  with check (true);

-- ORDERS — a customer may read their OWN order via its tracking token,
-- sent as the x-tracking-token request header (used by the tracking page).
drop policy if exists "Read own order by tracking token" on public.orders;
create policy "Read own order by tracking token"
  on public.orders for select
  using (
    tracking_token = current_setting('request.headers', true)::json->>'x-tracking-token'
  );

-- ORDER ITEMS — anyone can insert (checkout writes line items with the order).
drop policy if exists "Anyone can create order items" on public.order_items;
create policy "Anyone can create order items"
  on public.order_items for insert
  with check (true);

-- ORDER ITEMS — readable only for an order the caller owns (tracking token).
drop policy if exists "Read own order items by tracking token" on public.order_items;
create policy "Read own order items by tracking token"
  on public.order_items for select
  using (
    order_id in (
      select id from public.orders
      where tracking_token = current_setting('request.headers', true)::json->>'x-tracking-token'
    )
  );

-- ORDER STATUS HISTORY — readable only for an order the caller owns.
drop policy if exists "Read own order status history" on public.order_status_history;
create policy "Read own order status history"
  on public.order_status_history for select
  using (
    order_id in (
      select id from public.orders
      where tracking_token = current_setting('request.headers', true)::json->>'x-tracking-token'
    )
  );

-- ORDERS — a signed-in customer can read the orders placed with their
-- own (verified) email. Powers the "My Orders" account page.
drop policy if exists "Users read own orders by email" on public.orders;
create policy "Users read own orders by email"
  on public.orders for select
  using (auth.jwt() ->> 'email' = email);

-- ------------------------------------------------------------
-- PROFILES — each user manages ONLY their own row (id = auth.uid()).
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);


-- ============================================================
-- 6. REALTIME  (add tables to the supabase_realtime publication)
-- Guarded so re-running never errors on "already a member".
-- ============================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
    ) then
      alter publication supabase_realtime add table public.orders;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_status_history'
    ) then
      alter publication supabase_realtime add table public.order_status_history;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
    ) then
      alter publication supabase_realtime add table public.products;
    end if;
  end if;
end $$;


-- ============================================================
-- 7. STORAGE BUCKETS  (public image hosting)
--   product-images — admin Products page uploads
--   site-assets     — admin Content page hero/about images
-- ============================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

-- Public read for objects in those buckets (uploads happen via service role).
drop policy if exists "Public read product-images" on storage.objects;
create policy "Public read product-images"
  on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists "Public read site-assets" on storage.objects;
create policy "Public read site-assets"
  on storage.objects for select
  using (bucket_id = 'site-assets');


-- ============================================================
-- 8. SEED DATA
-- ============================================================

-- Singleton site_settings row (id = 1). Column defaults fill every key.
insert into public.site_settings (id) values (1)
on conflict (id) do nothing;

-- Starter delivery zones (only if none exist) so the analytics
-- zone breakdown has labels.
insert into public.delivery_zones (zone_name, postcode_pattern, price)
select * from (values
  ('Zone 1 — Central', 'EC*', 4.50),
  ('Zone 2 — Inner',   'N*',  6.00),
  ('Zone 3 — Outer',   'E*',  8.50)
) as v(zone_name, postcode_pattern, price)
where not exists (select 1 from public.delivery_zones);

-- Starter catalogue (only if the products table is empty) so the /menu
-- page renders real cards immediately. Safe & idempotent.
insert into public.products (name, category, description, price, badge, image_url, in_stock, visible, sort_order)
select * from (values
  ('Rose Pistachio Celebration Cake', 'Birthday Cakes', 'Three layers of rose-scented sponge, pistachio cream & dried petals.', 48.00, 'Bestseller', 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=900&q=80', true, true, 1),
  ('Vanilla Bean Buttercream Cupcakes', 'Cupcakes', 'Madagascar vanilla sponge crowned with silky swirls of buttercream.', 18.00, 'Box of 6', 'https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=900&q=80', true, true, 2),
  ('Salted Dark Chocolate Brownies', 'Brownies', 'Molten 70% chocolate centre finished with flaked sea salt.', 22.00, 'Fudgy', 'https://images.unsplash.com/photo-1607478900766-efe13248b125?auto=format&fit=crop&w=900&q=80', true, true, 3),
  ('Strawberries & Cream Dream Cake', 'Custom Cakes', 'Fresh strawberry compote layered with vanilla chantilly.', 56.00, 'New', 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=900&q=80', true, true, 4),
  ('Brown Butter Choc-Chip Cookies', 'Cookies', 'Nutty brown butter dough loaded with pools of chocolate.', 16.00, 'Box of 8', 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=900&q=80', true, true, 5),
  ('The Little Luxe Gift Box', 'Gift Boxes', 'A hand-tied box of cupcakes, cookies & brownie bites.', 34.00, 'Giftable', 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?auto=format&fit=crop&w=900&q=80', true, true, 6)
) as v(name, category, description, price, badge, image_url, in_stock, visible, sort_order)
where not exists (select 1 from public.products);


-- ============================================================
-- DONE. Reload the PostgREST schema cache if columns look missing:
--   notify pgrst, 'reload schema';
-- ============================================================
notify pgrst, 'reload schema';
