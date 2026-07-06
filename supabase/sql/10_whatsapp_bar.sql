-- ============================================================
-- 10_whatsapp_bar.sql — admin-managed WhatsApp bar on the Menu page
--
-- NOTE: site_settings is a SINGLETON ROW with typed columns (not a
-- key/value table), so the bar is a jsonb column, matching hero_banner /
-- announcement — not an INSERT (key, value) row. Adding the column with a
-- DEFAULT backfills the existing settings row with the seeded value.
--
-- Shape: { "enabled": bool, "text": "...", "number": "441234567890" }
-- Safe to run more than once.
-- ============================================================

alter table public.site_settings
  add column if not exists whatsapp_bar jsonb not null default
    '{"enabled": true, "text": "For any question", "number": "441234567890"}'::jsonb;
