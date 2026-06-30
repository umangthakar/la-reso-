-- ============================================================
-- LE RASA BAKERY — 08: Analytics schema
-- ------------------------------------------------------------
-- Brings the LIVE orders table up to what the Analytics page and
-- Dashboard need: per-order money columns, a delivery_zones table,
-- and an order_items table for "top products" reporting.
--
-- The live `orders` table started life as an enquiry form
-- (id, customer_name, email, phone, message, status, created_at)
-- so this migration is ADDITIVE and fully idempotent — safe to run
-- on the existing table without dropping anything.
--
-- Run this whole file once in the Supabase SQL Editor.
--
-- NOTE: the financial / item / zone data stays empty until a
-- checkout flow actually writes totals, line items, and zones.
-- The Analytics UI renders cleanly with zero data until then.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- DELIVERY ZONES  (referenced by orders.zone_id)
-- ------------------------------------------------------------
create table if not exists delivery_zones (
  id uuid primary key default uuid_generate_v4(),
  zone_name text not null,                 -- e.g. "Zone 1 — Central"
  postcode_pattern text,                   -- e.g. "SW1*" (UK postcode prefix)
  price numeric(10,2) not null default 0,
  free_delivery_threshold numeric(10,2),   -- null = no free-delivery option
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ORDERS — add money + zone + delivery_date columns if missing
-- ------------------------------------------------------------
alter table orders add column if not exists subtotal         numeric(10,2) not null default 0;
alter table orders add column if not exists delivery_charge  numeric(10,2) not null default 0;
alter table orders add column if not exists total            numeric(10,2) not null default 0;
alter table orders add column if not exists zone_id          uuid references delivery_zones(id) on delete set null;
alter table orders add column if not exists delivery_date    date;

create index if not exists idx_orders_created on orders(created_at desc);
create index if not exists idx_orders_status  on orders(status);
create index if not exists idx_orders_zone    on orders(zone_id);

-- ------------------------------------------------------------
-- ORDER ITEMS  (line items — drives "top products")
-- ------------------------------------------------------------
create table if not exists order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,              -- snapshot, survives product edits/deletes
  unit_price numeric(10,2) not null default 0,
  quantity int not null default 1 check (quantity > 0),
  line_total numeric(10,2) not null default 0
);

create index if not exists idx_order_items_order   on order_items(order_id);
create index if not exists idx_order_items_product on order_items(product_id);

-- ------------------------------------------------------------
-- RLS — admin reaches these via the service-role key (bypasses RLS).
-- delivery_zones is also safe to expose read-only to the public
-- storefront (for showing delivery costs). order_items stays private.
-- ------------------------------------------------------------
alter table delivery_zones enable row level security;
alter table order_items   enable row level security;

drop policy if exists "delivery_zones public read" on delivery_zones;
create policy "delivery_zones public read"
  on delivery_zones for select
  using (active = true);

-- ------------------------------------------------------------
-- Seed a few starter zones so the breakdown chart has labels.
-- Skipped automatically if any zones already exist.
-- ------------------------------------------------------------
insert into delivery_zones (zone_name, postcode_pattern, price)
select * from (values
  ('Zone 1 — Central',  'EC*', 4.50),
  ('Zone 2 — Inner',    'N*',  6.00),
  ('Zone 3 — Outer',    'E*',  8.50)
) as v(zone_name, postcode_pattern, price)
where not exists (select 1 from delivery_zones);
