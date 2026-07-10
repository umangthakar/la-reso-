-- ============================================================
-- 17_banner_right_content.sql — per-banner right-side content
--
-- Each rotating banner now owns what it renders on its RIGHT side, instead of
-- every banner inheriting the active offer's hero highlight ("30%"):
--
--   right_content_type : 'highlight' | 'image'   (default 'highlight')
--   right_image_url    : storage URL, used when right_content_type = 'image'
--   watermark_text     : the highlight text itself (already existed)
--
-- rotating_banners is a jsonb array, so NO column is added — this only
-- backfills the two new keys onto existing entries and refreshes the seed
-- default. Banners missing the keys are treated as 'highlight' by
-- lib/site-settings.ts#normaliseBanner, so this migration is optional for
-- correctness and purely keeps the stored data explicit.
--
-- Safe to re-run: the backfill only writes keys that are absent.
-- ============================================================

-- 1. Backfill existing banner entries that predate these keys.
update public.site_settings
set rotating_banners = (
  select jsonb_agg(
    banner
      || jsonb_build_object(
           'right_content_type',
           coalesce(banner ->> 'right_content_type', 'highlight')
         )
      || jsonb_build_object(
           'right_image_url',
           coalesce(banner ->> 'right_image_url', '')
         )
    order by ord
  )
  from jsonb_array_elements(rotating_banners) with ordinality as t(banner, ord)
)
where jsonb_typeof(rotating_banners) = 'array'
  and jsonb_array_length(rotating_banners) > 0
  and exists (
    select 1
    from jsonb_array_elements(rotating_banners) as b(banner)
    where not (banner ? 'right_content_type')
       or not (banner ? 'right_image_url')
  );

-- 2. Refresh the column default so brand-new rows seed with the keys present.
alter table public.site_settings
  alter column rotating_banners set default
    '[{"type":"custom_cakes","heading":"Custom Cakes for Every Occasion","subtext":"Birthdays, weddings, anniversaries — we craft the perfect eggless cake for your event","cta_text":"Order Custom Cake","cta_link":"/contact","watermark_text":"","right_content_type":"highlight","right_image_url":"","enabled":true},{"type":"offer","heading":"Special Offer","subtext":"Free delivery on orders over £60","cta_text":"Shop Now","cta_link":"/menu","watermark_text":"","right_content_type":"highlight","right_image_url":"","enabled":true}]'::jsonb;
