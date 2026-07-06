-- ============================================================
-- 12_rotating_banners.sql — auto-rotating Menu page banners
--
-- Replaces the single hero banner with an ordered array of banners that
-- auto-rotate every 5 seconds on the Menu page. Managed from the admin
-- Content & Settings → "Rotating Banners" section.
--
-- Shape: array of
--   { "type": "hero" | "offer" | "announcement",
--     "heading": "...", "subtext": "...", "enabled": bool }
--
-- Seeded with the two default banners. Safe to run more than once.
-- ============================================================

alter table public.site_settings
  add column if not exists rotating_banners jsonb default
    '[{"type":"hero","heading":"Every Bite, Eggless & Divine","subtext":"Handcrafted fresh daily — pick your craving","enabled":true},{"type":"offer","heading":"Custom Cakes — Designed just for you","subtext":"Order now for your special occasion","enabled":true}]'::jsonb;
