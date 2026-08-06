-- ============================================================
-- LE RASA — 46_brand_rename.sql
-- ------------------------------------------------------------
-- RENAME THE STORED BRAND: "Le Rasa Bakery" → "Le Rasa".
--
-- The brand copy shown across the site — every <title>, the Open Graph tags,
-- the JSON-LD structured data, the footer copyright — comes from the
-- site_settings.branding jsonb column, NOT from the code. lib/site-settings
-- only supplies defaults for fields the row does not have, so renaming the
-- brand in the codebase changes nothing on a site whose row already says
-- "Le Rasa Bakery". This script renames what is actually stored.
--
-- The emails do not need this. lib/email-brand rewrites the retired name on
-- the way out, so no email can carry it whatever the row holds. Everything
-- else (SEO, structured data, the footer) reads the row verbatim, which is
-- why the row itself has to be corrected.
--
-- WHAT IT TOUCHES: every STRING value inside site_settings.branding, and only
-- the exact phrase "Le Rasa Bakery". "Le Rasa" on its own, the tagline, and
-- every other column are left alone. Fields the admin has customised keep
-- their wording apart from that phrase.
--
-- Paste-and-run in the Supabase SQL Editor. IDEMPOTENT — the second run
-- matches nothing and updates no rows. Safe on the live database: it rewrites
-- brand copy only, and touches no order, customer or payment data.
--
-- The same result can be had by hand: Admin → Settings → Branding Settings,
-- edit the name and copyright, Save.
-- ============================================================

do $$
declare
  touched integer := 0;
  result  text;
begin
  -- The column arrives with 35_branding.sql. On a database that predates it
  -- there is nothing stored to rename, and the code defaults already apply.
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'site_settings'
      and column_name  = 'branding'
  ) then
    raise notice '46_brand_rename: site_settings.branding does not exist — nothing stored to rename (the code defaults already say "Le Rasa"). Run 35_branding.sql if you want the column.';
    return;
  end if;

  update public.site_settings
  set branding = (
        select jsonb_object_agg(
                 key,
                 case
                   when jsonb_typeof(value) = 'string'
                     then to_jsonb(replace(value #>> '{}', 'Le Rasa Bakery', 'Le Rasa'))
                   else value
                 end
               )
        from jsonb_each(branding)
      )
  where branding is not null
    and jsonb_typeof(branding) = 'object'
    and branding::text like '%Le Rasa Bakery%';

  get diagnostics touched = row_count;

  if touched = 0 then
    raise notice '46_brand_rename: nothing to rename — no stored branding contains "Le Rasa Bakery".';
  else
    raise notice '46_brand_rename: renamed the brand in % settings row(s).', touched;
  end if;

  -- Report what the site will now render, so the result is visible without a
  -- second query.
  select coalesce(
           string_agg(
             format('name=%s | short_name=%s | tagline=%s | copyright=%s',
                    coalesce(branding->>'name', '(default)'),
                    coalesce(branding->>'short_name', '(default)'),
                    coalesce(branding->>'tagline', '(default)'),
                    coalesce(branding->>'copyright', '(default)')),
             E'\n'),
           '(no settings row)')
    into result
  from public.site_settings;

  raise notice '46_brand_rename: branding is now → %', result;
end $$;

-- ------------------------------------------------------------
-- Anything else still carrying the old name? These are free-text fields an
-- admin wrote (the About paragraph, policy bodies, announcements); they are
-- NOT rewritten automatically, because they are prose rather than brand
-- fields. Run this to see whether any need an edit in the admin panel.
-- ------------------------------------------------------------
select 'site_settings' as source, key as field
from public.site_settings, jsonb_each_text(to_jsonb(site_settings)) as t(key, val)
where val like '%Le Rasa Bakery%';
