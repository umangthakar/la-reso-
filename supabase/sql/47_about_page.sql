-- ============================================================
-- Le Rasa Bakery — 47_about_page.sql
-- ------------------------------------------------------------
-- The About Us CMS: one `about_page` jsonb column on the site_settings
-- singleton holding every piece of copy and the photo the /about page renders,
-- managed from Admin → Content & Settings → About Us
-- (/admin/dashboard/settings/about).
--
-- WHY A COLUMN AND NOT A TABLE
--
-- The About page is a SINGLETON with a fixed set of fields — one hero heading,
-- one badge, one photo, three paragraphs — not a list of rows with their own
-- lifecycle. That is exactly the shape site_settings already holds for the
-- announcement bar, the hero banner and branding (35_branding.sql), so it uses
-- the same mechanism: one jsonb object, read through the existing settings
-- reader, written through the existing admin service-role client. A table
-- (like 36_hero_slider.sql) exists to give each ROW an id, an order and a
-- visible flag; none of those mean anything here.
--
-- WHY NOT REUSE about_story / about_image_url
--
-- Those two columns are NOT the /about page. `about_story` is the short blurb
-- on the HOME page (app/home/page.tsx reads settings.about.text), edited in the
-- "Homepage About blurb" section of Content & Settings. Overloading them would
-- make one edit change two unrelated surfaces. They are left exactly as they
-- are, and this column sits beside them.
--
-- IDEMPOTENT: safe to run repeatedly (ADD COLUMN IF NOT EXISTS, CREATE OR
-- REPLACE VIEW) — same conventions as 00_full_setup.sql.
--
-- PURELY ADDITIVE: one new column, plus the public view re-declared so the
-- storefront's anon key can read that column. No existing column is altered or
-- dropped, and no data is migrated.
-- ============================================================


-- ============================================================
-- 1. THE COLUMN
-- ------------------------------------------------------------
-- Shape (lib/about-content.ts is the single source of truth, and
-- normaliseAboutContent() fills in every missing field from the defaults, so a
-- NULL column, a `{}` and a half-written object all render the page that ships
-- in code):
--
--   {
--     "hero_eyebrow":     "Our Story",
--     "hero_heading":     "Born from a simple wish — cake for all",
--     "hero_description": "Le Rasa began in a tiny home kitchen …",
--     "badge":            "Est. with love",
--     "heading":          "From one home oven to a house of desserts",
--     "paragraphs":       ["…", "…", "…"],
--     "image_url":        "https://…/storage/v1/object/public/site-assets/about/…",
--     "image_alt":        "Baker decorating a cake"
--   }
--
-- NULL is the intended starting state: the /about page falls back to the copy
-- that is in the code today, so this migration changes nothing visible until an
-- admin saves for the first time.
-- ============================================================

alter table public.site_settings
  add column if not exists about_page jsonb;

comment on column public.site_settings.about_page is
  'About Us page content (headings, badge, paragraphs, photo). Shape and defaults live in lib/about-content.ts. NULL = use the built-in defaults. Distinct from about_story/about_image_url, which are the HOME page blurb.';


-- ============================================================
-- 2. THE PUBLIC VIEW
-- ------------------------------------------------------------
-- 43_critical_security_fixes.sql closed site_settings to anon and exposes the
-- public columns through site_settings_public. A new column is NOT in that view
-- until the view is re-declared, so the storefront would read NULL and silently
-- fall back to the defaults forever — i.e. the admin could save and see nothing
-- change.
--
-- This is a verbatim copy of the view from 43 with `about_page` APPENDED AS THE
-- LAST COLUMN. Every other line, including the stripe_config projection that
-- drops the encrypted secret key, is unchanged. about_page holds only public
-- marketing copy and a public storage URL, so it is safe to expose.
--
-- WHY LAST, AND NOT NEXT TO about_story WHERE IT BELONGS
--
-- CREATE OR REPLACE VIEW can only ADD columns to the END of the select list. It
-- cannot insert, reorder, rename or retype an existing one — Postgres matches
-- the new definition against the old positionally and refuses with
--
--   ERROR: cannot change name of view column "categories" to "about_page"
--
-- if anything moves. Putting about_page beside about_story, where it reads
-- better, would therefore make this migration fail outright on any database
-- that already has the view.
--
-- The alternative — DROP VIEW then CREATE — is deliberately NOT used. A drop
-- would revoke the anon/authenticated grants and, for the moment between the
-- two statements, leave the storefront with no readable settings source at all
-- (the base table is closed to anon by 43), i.e. a live site briefly rendering
-- defaults. Appending costs nothing: PostgREST returns columns by NAME, so
-- position is invisible to lib/site-settings.ts and to every other reader.
-- ============================================================

create or replace view public.site_settings_public as
select
  id,
  site_name,
  tagline,
  branding,
  logo,
  contact,
  phone,
  email,
  address,
  whatsapp,
  whatsapp_bar,
  whatsapp_status,
  instagram_url,
  instagram_reels,
  facebook_url,
  tiktok_url,
  announcement,
  rotating_banners,
  hero_image_url,
  hero_tagline,
  hero_button_text,
  about_story,
  about_image_url,
  categories,
  category_parents,
  delivery_zones,
  delivery_days,
  blocked_dates,
  lead_time_days,
  daily_order_cap,
  active_theme,
  google_reviews_cache,   -- cached PUBLIC review text/ratings; no API key
  updated_at,
  -- Publishable key + mode only. The encrypted secret key is dropped here.
  jsonb_build_object(
    'publishable_key', stripe_config ->> 'publishable_key',
    'mode',            stripe_config ->> 'mode',
    'has_secret_key',  (nullif(stripe_config ->> 'secret_key_enc', '') is not null)
  ) as stripe_config,
  -- APPEND-ONLY POSITION. Added by 47_about_page.sql; it must stay last, and
  -- any future column must go after it, for the reason above. Logically it
  -- belongs next to about_story — it is not there because it cannot be.
  about_page
from public.site_settings;

comment on view public.site_settings_public is
  'Public projection of site_settings for the anon key. Excludes stripe_config.secret_key_enc, google_reviews_config (api_key_enc), whatsapp_config and notification_config. See supabase/sql/43_critical_security_fixes.sql and 47_about_page.sql.';

grant select on public.site_settings_public to anon, authenticated;


-- ============================================================
-- 3. STORAGE
-- ------------------------------------------------------------
-- Nothing to do. About photos are written into the EXISTING public
-- `site-assets` bucket under the `about/` prefix, the same way hero slider
-- images use `hero-slider/` (36_hero_slider.sql §5): Supabase Storage has no
-- real directories, so a prefix needs no creation step, and the bucket is
-- created on first use by /api/admin/site-assets/upload.
--
-- The prefix is what makes cleanup safe. site-assets is SHARED with the logo,
-- the home slider, policy images and offer artwork, so
-- aboutImageStoragePath() (lib/about-content.ts) only ever returns a key that
-- starts with `about/` — a delete can therefore never reach an object another
-- part of the admin panel owns.
-- ============================================================
