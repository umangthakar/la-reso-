-- ============================================================
-- 43_critical_security_fixes.sql
-- Le Rasa Bakery — P0 security fixes C1 and C4 from the audit.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR (Dashboard → SQL Editor → New query).
-- Idempotent: safe to run more than once.
--
-- C1  Only HALF of this was live, and the live half is the dangerous one.
--     Measured against this database with the public anon key:
--       • orders       → INSERT already DENIED (42501). The
--                        "Anyone can create an order" policy from
--                        00_full_setup.sql was never applied here.
--       • order_items  → INSERT **ALLOWED**. "Anyone can create order items"
--                        IS live, so anyone holding an order's UUID — which a
--                        customer gets from their own /order-confirmation/<id>
--                        URL — can append arbitrary line items to it: pay £5,
--                        then bolt ten £249 cakes onto that order. The baker
--                        works from those rows.
--     Note when re-testing: `.insert(...).select()` also needs SELECT rights,
--     so it can return 42501 while the INSERT itself would have succeeded.
--     Probe with a bare .insert() to see the truth.
--     00_full_setup.sql has also been corrected so a fresh project cannot
--     recreate either policy.
--
-- C4  site_settings was readable by the anon key, and it holds
--     stripe_config.secret_key_enc (the encrypted Stripe secret key) and
--     google_reviews_config.api_key_enc. Anyone could fetch those ciphertexts.
--
-- Nothing here changes application behaviour: the checkout writes orders with
-- the SERVICE ROLE from /api/orders/create (service role bypasses RLS), and
-- the storefront reads settings through the new public view.
-- ============================================================


-- ============================================================
-- C1 — orders / order_items: no anonymous inserts
-- ------------------------------------------------------------
-- Idempotent and safe to run whether or not the policies exist. The current
-- checkout inserts server-side in /api/orders/create using the service-role
-- key, which is exempt from RLS and from these grants — so this changes
-- nothing about how a real order is placed.
-- ============================================================

drop policy if exists "Anyone can create an order"     on public.orders;
drop policy if exists "Anyone can create order items"  on public.order_items;

-- Defence in depth: also remove the table-level INSERT grant, so a future
-- permissive policy cannot silently re-open this on its own.
revoke insert on public.orders      from anon, authenticated;
revoke insert on public.order_items from anon, authenticated;

-- RLS must stay ON for both tables (with no INSERT policy, inserts are denied).
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;


-- ============================================================
-- C4 — site_settings: secrets are no longer publicly readable
-- ------------------------------------------------------------
-- The storefront genuinely needs the PUBLIC parts of this row (branding,
-- contact details, delivery zones, the announcement bar, the Stripe
-- PUBLISHABLE key…). So rather than break that, we expose exactly those
-- through a view and close the base table to the public roles.
--
-- The view is owned by the role that runs this script (postgres) and is
-- deliberately NOT `security_invoker`, so reading it does not require any
-- privilege on site_settings itself.
--
-- stripe_config is rebuilt to carry ONLY the publishable key and the mode —
-- secret_key_enc can no longer leave the database. lib/site-settings.ts
-- already reads just those two fields, so nothing downstream changes.
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
  --
  -- `has_secret_key` is a BOOLEAN stand-in for it: the checkout page shows or
  -- hides the payment step based on whether a secret key exists somewhere
  -- (site-settings#stripePublic → payments_configured), and it used to learn
  -- that by seeing the ciphertext. It must keep working without ever receiving
  -- the ciphertext itself.
  jsonb_build_object(
    'publishable_key', stripe_config ->> 'publishable_key',
    'mode',            stripe_config ->> 'mode',
    'has_secret_key',  (nullif(stripe_config ->> 'secret_key_enc', '') is not null)
  ) as stripe_config
from public.site_settings;

comment on view public.site_settings_public is
  'Public projection of site_settings for the anon key. Excludes stripe_config.secret_key_enc, google_reviews_config (api_key_enc), whatsapp_config and notification_config. See supabase/sql/43_critical_security_fixes.sql.';

grant select on public.site_settings_public to anon, authenticated;

-- Close the base table to the public roles. Both mechanisms are applied:
-- dropping the policy stops row access under RLS, and revoking the grant makes
-- the refusal explicit rather than "zero rows".
drop policy if exists "Public read site settings" on public.site_settings;
revoke select on public.site_settings from anon, authenticated;

-- The admin panel and every server route read this table with the service-role
-- key, which bypasses both RLS and these grants — so admin editing of Stripe
-- keys, WhatsApp config, delivery zones and content is unaffected.


-- ============================================================
-- VERIFICATION — expected results are noted against each query.
-- ============================================================

-- 1) No INSERT policy should remain on orders / order_items.
--    Expect: zero rows.
-- select tablename, policyname, cmd
--   from pg_policies
--  where schemaname = 'public'
--    and tablename in ('orders','order_items')
--    and cmd = 'INSERT';

-- 2) anon must hold no INSERT on orders and no SELECT on site_settings.
--    Expect: zero rows.
-- select table_name, privilege_type, grantee
--   from information_schema.role_table_grants
--  where table_schema = 'public'
--    and grantee in ('anon','authenticated')
--    and (
--      (table_name in ('orders','order_items') and privilege_type = 'INSERT')
--      or (table_name = 'site_settings' and privilege_type = 'SELECT')
--    );

-- 3) The public view must not leak the secret key.
--    Expect: one row, stripe_config containing only publishable_key + mode.
-- select stripe_config from public.site_settings_public;
