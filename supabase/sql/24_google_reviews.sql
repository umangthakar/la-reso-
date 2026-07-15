-- ============================================================
-- 24_google_reviews.sql
-- ------------------------------------------------------------
-- Google Reviews management system (admin-panel managed, like Stripe).
--
-- Adds two jsonb columns to the site_settings singleton:
--
--   google_reviews_config  — SECRET config, mirrors stripe_config:
--     {
--       enabled:     boolean,
--       api_key_enc: string,   -- AES-256-GCM encrypted (lib/crypto), NEVER
--                              --   returned to the browser
--       place_id:    string,
--       cache_hours: number    -- 1 | 3 | 6 | 12 | 24  (default 6)
--     }
--
--   google_reviews_cache   — public-safe cached payload + sync status:
--     {
--       rating:         number,          -- business rating (e.g. 5.0)
--       total:          number,          -- total review count
--       reviews:        [ { author_name, profile_photo_url, rating,
--                           text, relative_time } ],
--       synced_at:      string,          -- ISO of the last SUCCESSFUL sync
--       place_id:       string,          -- which place the cache belongs to
--       status:         string,          -- connected | failed | invalid_key
--                                        --   | invalid_place
--       status_message: string,
--       checked_at:     string           -- ISO of the last attempt (any outcome)
--     }
--
-- The API key is only ever read server-side (service role) and decrypted
-- with lib/crypto; it is never selected into the public storefront reader
-- and never serialised to the client.
--
-- Idempotent — safe to run whether or not the columns exist.
-- Run in the Supabase SQL editor for project fessgqsjotvovzeqooza.
-- ============================================================

alter table public.site_settings
  add column if not exists google_reviews_config jsonb;

alter table public.site_settings
  add column if not exists google_reviews_cache jsonb;

-- Force PostgREST to pick up the new columns immediately.
notify pgrst, 'reload schema';
