-- ============================================================
-- LE RASA BAKERY — content & settings columns on site_settings
-- Run this ONCE in the Supabase SQL Editor. Idempotent.
--
-- Powers /admin/dashboard/settings (Content & Settings). phone, email
-- and address already exist on site_settings; everything below is new.
-- ============================================================

-- Contact details
alter table site_settings add column if not exists whatsapp text;

-- Announcement banner shown site-wide: { "enabled": bool, "text": "..." }
alter table site_settings
  add column if not exists announcement jsonb not null
  default '{"enabled": false, "text": ""}'::jsonb;

-- Social media
alter table site_settings add column if not exists instagram_url text;
alter table site_settings add column if not exists facebook_url text;
alter table site_settings add column if not exists tiktok_url text;

-- Homepage hero
alter table site_settings add column if not exists hero_tagline text;
alter table site_settings add column if not exists hero_button_text text;
alter table site_settings add column if not exists hero_image_url text;

-- About page
alter table site_settings add column if not exists about_story text;
alter table site_settings add column if not exists about_image_url text;
