-- ============================================================
-- 35_branding.sql — Dynamic bakery branding settings
--
-- A single jsonb `branding` column on the site_settings singleton that is
-- the source of truth for every piece of brand copy shown across the site:
-- the navbar/footer/splash wordmark & tagline, footer description, splash
-- subtitle, business description and copyright, plus the SEO metadata.
-- Edited from the admin Content & Settings → "Branding Settings" section.
--
-- Every field mirrors the value that used to be hardcoded, so the storefront
-- is visually unchanged until the admin edits it. The app also fills in any
-- missing field with the same defaults (see lib/site-settings.ts
-- BRANDING_DEFAULT / normaliseBranding), so this migration is optional for the
-- app to run — it just lets the admin persist edits.
--
-- Safe to run more than once.
-- ============================================================

alter table public.site_settings
  add column if not exists branding jsonb not null default
    '{
      "name": "Le Rasa Bakery",
      "short_name": "Le Rasa",
      "tagline": "House of Eggless Desserts",
      "description": "Le Rasa Bakery crafts stunning, 100% eggless cakes, cupcakes, brownies, cookies and gift boxes. Premium desserts everyone can share.",
      "hero_subtitle": "The House of Eggless Desserts",
      "footer_description": "The house of eggless desserts. Handcrafted cakes & treats baked fresh, so everyone gets a slice of the celebration.",
      "copyright": "Le Rasa Bakery. All rights reserved."
    }'::jsonb;
