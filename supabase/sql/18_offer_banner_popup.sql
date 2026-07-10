-- ============================================================
-- 18_offer_banner_popup.sql — per-offer banner right-side content + home popup
--
-- Phase 1 (15_offers.sql) gave every offer its storefront copy:
--   announcement_text, hero_heading, hero_subtext, hero_highlight_text,
--   cta_text, cta_link, banner_image_url
--
-- Those cover the LEFT side of the Special Offer banner and its backdrop. This
-- migration adds the two things that were still missing, so that EVERY offer
-- type (not just percentage) can fully drive the storefront:
--
--   1. The banner's RIGHT side, which until now always rendered the big
--      hero/watermark text. An offer can now choose an image instead:
--        hero_display_mode : 'text' | 'image'   (default 'text')
--        hero_image_url    : storage URL, used when hero_display_mode = 'image'
--
--   2. The home-page popup, which until now had to borrow the banner's copy:
--        popup_title, popup_description, popup_image_url,
--        popup_cta_text, popup_cta_link
--
-- Every column is nullable (or defaulted), so existing rows keep working
-- untouched: a NULL popup_* falls back to the banner copy exactly as before,
-- and hero_display_mode defaults to 'text' which is the historical behaviour.
--
-- NOTE: no new offer `type` is introduced. Seasonal promotions (Christmas,
-- Diwali, Halloween, Valentine's, New Year, Black Friday, Easter) are authored
-- as type = 'custom' and get their look purely from these content columns.
--
-- Safe to re-run: every statement is `if not exists` / idempotent.
-- ============================================================

-- 1. Banner right-side content -------------------------------------------
alter table public.offers
  add column if not exists hero_display_mode text not null default 'text',
  add column if not exists hero_image_url    text;

-- Constraint added separately so re-running against a table that already has
-- it does not error.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'offers_hero_display_mode_check'
  ) then
    alter table public.offers
      add constraint offers_hero_display_mode_check
      check (hero_display_mode in ('text', 'image'));
  end if;
end $$;

-- 2. Home-page popup content ---------------------------------------------
alter table public.offers
  add column if not exists popup_title       text,
  add column if not exists popup_description text,
  add column if not exists popup_image_url   text,
  add column if not exists popup_cta_text    text,
  add column if not exists popup_cta_link    text;

-- 3. Backfill: rows created before this migration are explicitly 'text'.
--    (The column default already handles this; this is belt-and-braces for any
--    row where the column was added as NULL by an older partial run.)
update public.offers
set hero_display_mode = 'text'
where hero_display_mode is null;

-- ============================================================
-- RLS — unchanged on purpose.
--
-- The anon policy from 15_offers.sql still reads:
--     using (enabled = true and type <> 'coupon')
-- so coupon rows remain non-enumerable. A coupon offer reaches the storefront
-- banner/popup only through GET /api/offers/active, which reads coupon rows
-- with the service role and returns ONLY the presentation columns listed
-- above — never coupon_code. An admin publishes a code by typing it into
-- hero_highlight_text; it is never auto-derived from coupon_code.
-- ============================================================

comment on column public.offers.hero_display_mode is
  'Banner right side: ''text'' renders hero_highlight_text, ''image'' renders hero_image_url.';
comment on column public.offers.hero_image_url is
  'Promotional image shown on the banner right side when hero_display_mode = ''image''.';
comment on column public.offers.popup_title is
  'Home-page popup title. Falls back to hero_heading, then the offer name.';
comment on column public.offers.popup_description is
  'Home-page popup body. Falls back to announcement_text, then hero_subtext.';
comment on column public.offers.popup_image_url is
  'Home-page popup image. Falls back to banner_image_url.';
comment on column public.offers.popup_cta_text is
  'Home-page popup button label. Falls back to cta_text, then ''View Offers''.';
comment on column public.offers.popup_cta_link is
  'Home-page popup button href. Falls back to cta_link, then ''/menu''.';
