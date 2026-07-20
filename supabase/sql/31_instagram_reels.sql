-- ============================================================
-- LE RASA BAKERY — Instagram Reels for the "Follow the sweetness"
-- footer gallery.
-- ------------------------------------------------------------
-- Paste-and-run in the Supabase SQL Editor. IDEMPOTENT and ADDITIVE —
-- safe to run repeatedly and safe on the live database. Nothing else is
-- touched; when this column is empty the footer keeps showing its
-- existing static image carousel exactly as before (full backward
-- compatibility).
--
--   site_settings.instagram_reels  (jsonb array of reel URL strings, max 10)
-- ============================================================

alter table public.site_settings
  add column if not exists instagram_reels jsonb not null default '[]'::jsonb;
