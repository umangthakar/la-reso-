-- ============================================================
-- Le Rasa Bakery — 36_hero_slider.sql
-- ------------------------------------------------------------
-- The Hero Slider module's schema: one `hero_slider_images` table holding the
-- PNG images shown in the home hero, managed from its own admin page
-- (/admin/dashboard/hero-slider).
--
-- WHY A TABLE AND NOT A jsonb COLUMN
--
-- The home hero currently reads site_settings.home_slider — a jsonb array of
-- URL strings (see 13_home_slider.sql). That shape carries a URL and nothing
-- else: no per-image visible flag, no stable identity to address a single
-- image by, no created_at. This module needs all three (an image can be hidden
-- without being deleted, and the admin page addresses rows by id), so it gets a
-- real table with per-row lifecycle, exactly like `policies` (19_policies.sql).
--
-- 13_home_slider.sql is NOT touched, dropped or migrated by this file. The
-- jsonb column and the hero that reads it keep working unchanged; this table
-- simply exists alongside it, empty, until a later phase populates it and
-- switches the hero over.
--
-- IDEMPOTENT: safe to run repeatedly (IF NOT EXISTS, DROP POLICY IF EXISTS,
-- DROP TRIGGER IF EXISTS) — same conventions as 00_full_setup.sql.
--
-- PURELY ADDITIVE: creates one new table and touches nothing that already
-- exists. No existing migration is modified. No seed rows — the admin page
-- opens on its empty state until the first image is uploaded.
--
-- Security posture (identical to `policies`):
--   * anon reads VISIBLE images only — a hidden image must not be fetchable
--     by the storefront, so RLS enforces it rather than every read
--     remembering to filter.
--   * No public INSERT/UPDATE/DELETE. The admin panel writes through the
--     SERVICE ROLE key server-side, which bypasses RLS entirely — the model
--     every other admin table uses.
-- ============================================================


-- ============================================================
-- 1. HERO SLIDER IMAGES
-- ------------------------------------------------------------
--   image_url      public URL of the uploaded PNG. Stored as the full public
--                  URL rather than a storage path, matching every other image
--                  column in this schema (products.image_url,
--                  site_settings.logo, home_slider) so one convention covers
--                  them all and next/image can consume it directly — the
--                  Supabase Storage host is already allow-listed in
--                  next.config.mjs for /storage/v1/object/public/**.
--   display_order  the admin's drag-to-reorder position, ascending. Named
--                  display_order (not sort_order) to match `policies`, which
--                  is the module this one is modelled on; products' older
--                  sort_order means the same thing.
--   visible        admin on/off switch. Hiding is not deleting: an image the
--                  bakery rotates seasonally stays in the list, out of the
--                  hero, with its file intact in storage.
--   created_at     insertion time. Also the tie-break for rows that share a
--                  display_order (every row is 0 before the first drag), so
--                  the list can never shuffle between loads.
--   updated_at     maintained by the trigger in section 3.
-- ============================================================
create table if not exists public.hero_slider_images (
  id            uuid primary key default gen_random_uuid(),
  image_url     text not null,
  display_order integer not null default 0,
  visible       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);


-- ============================================================
-- 2. INDEXES
-- ------------------------------------------------------------
-- (visible, display_order) serves the storefront query — visible images, in
-- the admin's order — which is the one query that runs on a customer request.
-- Column order matters: `visible` is the equality filter, so it leads, and
-- `display_order` then supplies the sort, letting Postgres satisfy the whole
-- query from the index without a sort step.
--
-- The admin list (every row, visible or not, ordered by display_order) is
-- deliberately left unindexed. It is a handful of rows read by one
-- authenticated user, so the planner's sequential scan plus sort costs less
-- than a second index costs on every write.
-- ============================================================
create index if not exists idx_hero_slider_visible_order
  on public.hero_slider_images (visible, display_order);


-- ============================================================
-- 3. TRIGGER (keep updated_at fresh — reuses set_updated_at from 00_full_setup)
-- ============================================================
drop trigger if exists trg_hero_slider_images_updated on public.hero_slider_images;
create trigger trg_hero_slider_images_updated before update on public.hero_slider_images
  for each row execute function public.set_updated_at();


-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================
alter table public.hero_slider_images enable row level security;

-- Public read of VISIBLE images only — same trust level and shape as
-- "Public read visible products" in 00_full_setup.sql and "Public read enabled
-- policies" in 19_policies.sql.
--
-- There is intentionally NO anon INSERT/UPDATE/DELETE policy. With RLS on and
-- no permissive policy for those commands, anon and authenticated are denied
-- them outright. The admin panel is the only writer and it goes through the
-- service role, which bypasses RLS.
drop policy if exists "Public read visible hero slider images" on public.hero_slider_images;
create policy "Public read visible hero slider images"
  on public.hero_slider_images for select
  using (visible = true);


-- ============================================================
-- 5. STORAGE — the hero-slider/ folder
-- ------------------------------------------------------------
-- NO NEW BUCKET. Hero PNGs live under the `hero-slider/` prefix inside the
-- EXISTING public `site-assets` bucket (created in 00_full_setup.sql section
-- 7, which is also where the hero/about images the admin already uploads go).
--
-- There is nothing to create here, and that is not an omission: Supabase
-- Storage has no folder entity. A "folder" is purely the leading path segment
-- of an object's key, so `hero-slider/` comes into existence with the first
-- object written to `hero-slider/<file>.png` and disappears when the last one
-- is removed. (The Storage UI's "create folder" button fakes it by writing a
-- hidden .emptyFolderPlaceholder object; a SQL insert into storage.objects
-- would register a row with no corresponding file in the storage backend, so
-- neither is worth doing.)
--
-- The prefix is defined once in application code — HERO_SLIDER_FOLDER in
-- lib/hero-slider.ts — so the upload route added in a later phase and any
-- cleanup that deletes files agree on it by construction.
--
-- The existing "Public read site-assets" policy (00_full_setup.sql) is scoped
-- to the whole bucket (bucket_id = 'site-assets'), so it already covers this
-- prefix. No new storage policy is required.
-- ============================================================


-- ============================================================
-- DONE. Reload the PostgREST schema cache so the new table is queryable
-- immediately.
-- ============================================================
notify pgrst, 'reload schema';
