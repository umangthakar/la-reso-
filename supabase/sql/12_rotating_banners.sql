-- ============================================================
-- 12_rotating_banners.sql — auto-rotating Menu page banners
--
-- Replaces the single hero banner with an ordered array of banners that
-- auto-rotate every 5 seconds on the Menu page. Managed from the admin
-- Content & Settings → "Rotating Banners" section.
--
-- Shape: array of
--   { "type": "hero" | "offer" | "announcement" | "custom_cakes",
--     "heading", "subtext", "cta_text", "cta_link", "enabled" }
--
-- Seeded with the two default banners (Custom Cakes + Offer). Safe to re-run.
-- ============================================================

alter table public.site_settings
  add column if not exists rotating_banners jsonb default
    '[{"type":"custom_cakes","heading":"Custom Cakes for Every Occasion","subtext":"Birthdays, weddings, anniversaries — we craft the perfect eggless cake for your event","cta_text":"Order Custom Cake","cta_link":"/contact","enabled":true},{"type":"offer","heading":"Special Offer","subtext":"Free delivery on orders over £60","cta_text":"Shop Now","cta_link":"/menu","enabled":true}]'::jsonb;
