-- ============================================================
-- LE RASA BAKERY — delivery settings columns on site_settings
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor).
-- Idempotent — safe to run again; existing columns are left as-is.
--
-- The admin Delivery Settings page (/admin/dashboard/delivery) reads
-- and writes these on the single site_settings row via
-- /api/admin/delivery. JSON arrays are stored as jsonb; the two caps
-- are plain integers.
-- ============================================================

-- Delivery zones: [{ "id", "name", "postcode_prefix", "fee" }, ...]
alter table site_settings
  add column if not exists delivery_zones jsonb not null default '[]'::jsonb;

-- Minimum days notice required before a delivery date.
alter table site_settings
  add column if not exists lead_time_days integer not null default 3;

-- Blocked dates: ["2026-12-25", "2026-12-26", ...] (YYYY-MM-DD strings).
alter table site_settings
  add column if not exists blocked_dates jsonb not null default '[]'::jsonb;

-- Days delivery is offered: ["monday","wednesday","friday", ...].
alter table site_settings
  add column if not exists delivery_days jsonb not null
  default '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]'::jsonb;

-- Max orders accepted per delivery date. NULL = no cap.
alter table site_settings
  add column if not exists daily_order_cap integer;
