-- ============================================================
-- LE RASA BAKERY — admin product-management columns
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor).
-- It is idempotent — safe to run again; existing columns are left as-is.
-- ============================================================

-- Hide a product from the storefront without deleting it.
alter table products add column if not exists visible boolean not null default true;

-- Free-text allergens, e.g. "Contains nuts, gluten, dairy".
alter table products add column if not exists allergens text;

-- Manual display ordering for the admin product list (drag-to-reorder).
alter table products add column if not exists sort_order integer not null default 0;

-- One-time backfill so existing rows get a sensible initial order
-- (oldest first). New rows default to 0 and can be dragged into place.
update products p
set sort_order = sub.rn
from (
  select id, row_number() over (order by created_at) as rn
  from products
) sub
where p.id = sub.id
  and p.sort_order = 0;
