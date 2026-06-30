-- ============================================================
-- LE RASA BAKERY — FULL SUPABASE SCHEMA
-- Real-time ready: orders, order_status_history, products
-- Run this entire file in Supabase SQL Editor (one go)
-- ============================================================

-- ------------------------------------------------------------
-- EXTENSIONS
-- ------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- CATEGORIES
-- ------------------------------------------------------------
create table categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- PRODUCTS  (real-time enabled — stock status, hide/show)
-- ------------------------------------------------------------
create table products (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(10,2) not null,
  allergens text[],            -- e.g. {'nuts','gluten'}
  images text[],                -- Cloudflare R2 URLs
  in_stock boolean not null default true,
  hidden boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_products_category on products(category_id);
create index idx_products_visible on products(hidden, in_stock);

-- ------------------------------------------------------------
-- DELIVERY ZONES
-- ------------------------------------------------------------
create table delivery_zones (
  id uuid primary key default uuid_generate_v4(),
  zone_name text not null,           -- e.g. "Zone 1"
  postcode_pattern text not null,    -- e.g. "SW1*" or regex-style prefix
  price numeric(10,2) not null,
  free_delivery_threshold numeric(10,2),  -- null = no free delivery option
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- DELIVERY SETTINGS (singleton row — only one config)
-- ------------------------------------------------------------
create table delivery_settings (
  id int primary key default 1,
  lead_time_days int not null default 3,
  max_advance_days int not null default 28,
  delivery_days int[] not null default '{1,2,3,4,5}',  -- 0=Sun .. 6=Sat
  daily_cap int,  -- null = unlimited
  updated_at timestamptz not null default now(),
  constraint singleton check (id = 1)
);
insert into delivery_settings (id) values (1);

-- ------------------------------------------------------------
-- BLOCKED DATES
-- ------------------------------------------------------------
create table blocked_dates (
  id uuid primary key default uuid_generate_v4(),
  blocked_date date not null unique,
  reason text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- CUSTOMERS (optional accounts — guest checkout also supported)
-- ------------------------------------------------------------
create table customers (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid references auth.users(id) on delete cascade,  -- null if guest
  email text not null,
  name text,
  phone text,
  saved_addresses jsonb default '[]',
  created_at timestamptz not null default now()
);

create unique index idx_customers_auth_user on customers(auth_user_id) where auth_user_id is not null;
create index idx_customers_email on customers(email);

-- ------------------------------------------------------------
-- ORDERS  (real-time enabled — admin dashboard + customer tracking)
-- ------------------------------------------------------------
create table orders (
  id uuid primary key default uuid_generate_v4(),
  tracking_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  customer_id uuid references customers(id) on delete set null,  -- null for guest

  -- guest/contact info (always stored, even if customer_id set, for record-keeping)
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  delivery_address jsonb not null,  -- {line1, line2, city, postcode}

  zone_id uuid references delivery_zones(id) on delete set null,
  delivery_charge numeric(10,2) not null default 0,
  subtotal numeric(10,2) not null,
  total numeric(10,2) not null,

  delivery_date date not null,
  special_instructions text,

  status text not null default 'received'
    check (status in ('received','preparing','out_for_delivery','delivered','cancelled')),

  stripe_payment_intent_id text,
  payment_status text not null default 'pending'
    check (payment_status in ('pending','paid','failed','refunded')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_orders_status on orders(status);
create index idx_orders_delivery_date on orders(delivery_date);
create index idx_orders_tracking_token on orders(tracking_token);
create index idx_orders_customer on orders(customer_id);
create index idx_orders_created on orders(created_at desc);

-- ------------------------------------------------------------
-- ORDER ITEMS
-- ------------------------------------------------------------
create table order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,   -- snapshot, in case product is later edited/deleted
  unit_price numeric(10,2) not null,
  quantity int not null check (quantity > 0),
  line_total numeric(10,2) not null
);

create index idx_order_items_order on order_items(order_id);

-- ------------------------------------------------------------
-- ORDER STATUS HISTORY  (real-time enabled — drives tracking page + emails)
-- ------------------------------------------------------------
create table order_status_history (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  status text not null,
  note text,
  created_at timestamptz not null default now()
);

create index idx_status_history_order on order_status_history(order_id, created_at desc);

-- ------------------------------------------------------------
-- INVOICES
-- ------------------------------------------------------------
create table invoices (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade unique,
  pdf_url text not null,
  invoice_number text not null unique,
  generated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- CAKE INQUIRIES (personalised cake form)
-- ------------------------------------------------------------
create table cake_inquiries (
  id uuid primary key default uuid_generate_v4(),
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  occasion text,
  size_portions text,
  flavour_preferences text,
  special_message text,
  preferred_delivery_date date,
  reference_photo_url text,
  status text not null default 'new'
    check (status in ('new','quoted','converted','closed')),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- SITE SETTINGS (singleton row — homepage/about/contact/social)
-- ------------------------------------------------------------
create table site_settings (
  id int primary key default 1,
  hero_image_url text,
  hero_tagline text,
  hero_cta_text text default 'Order Now',
  about_story text,
  about_photos text[],
  opening_hours jsonb,         -- {mon: "9-5", tue: "9-5", ...}
  address text,
  phone text,
  email text,
  whatsapp_number text,
  social_links jsonb default '{}',  -- {instagram: "url", facebook: "url", ...}
  announcement_banner_text text,
  announcement_banner_active boolean default false,
  updated_at timestamptz not null default now(),
  constraint singleton check (id = 1)
);
insert into site_settings (id) values (1);

-- ------------------------------------------------------------
-- AUTO-UPDATE updated_at TRIGGERS
-- ------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();

create trigger trg_orders_updated before update on orders
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- AUTO-INSERT order_status_history WHEN orders.status CHANGES
-- (this is what makes the tracking page "just work" off one table)
-- ------------------------------------------------------------
create or replace function log_order_status_change()
returns trigger as $$
begin
  if (tg_op = 'INSERT') or (old.status is distinct from new.status) then
    insert into order_status_history (order_id, status)
    values (new.id, new.status);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_order_status_log after insert or update on orders
  for each row execute function log_order_status_change();
