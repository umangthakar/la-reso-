-- ============================================================
-- 23_profiles_fix.sql
-- ------------------------------------------------------------
-- FIX: "Could not find the table 'public.profiles' in the schema
-- cache." (PostgREST PGRST205)
--
-- Root cause: the `public.profiles` table defined in
-- 00_full_setup.sql was never actually created in the live
-- project (ref fessgqsjotvovzeqooza). Every other table
-- (products, orders, site_settings, …) exists, but profiles is
-- absent from the catalog — so PostgREST reports it as missing
-- from the schema cache. This is a genuinely-missing table, not
-- a stale cache: PGRST205 even hints at a sibling table
-- ("Perhaps you meant the table 'public.products'"), which only
-- happens when the table isn't in the catalog at all.
--
-- Schema note: the columns below MATCH THE RUNNING APP
-- (app/account/complete-profile/page.tsx, app/checkout/page.tsx,
-- app/auth/callback/route.ts), which read/write:
--   first_name, last_name, phone, default_address (jsonb)
-- where default_address = { line1, street, city, postcode }.
-- The app does NOT use flat full_name/address/city/postcode
-- columns, so those are intentionally not created here — adding
-- them would leave the real fields missing and break the UI.
--
-- Idempotent: safe to run whether or not the table already
-- exists. Run this in the Supabase SQL editor (or via the CLI)
-- for project fessgqsjotvovzeqooza.
-- ============================================================

-- 1. TABLE ---------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  first_name      text,
  last_name       text,
  phone           text,
  default_address jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- If an older/partial profiles table already exists, make sure
-- the columns the app relies on are present.
alter table public.profiles add column if not exists first_name      text;
alter table public.profiles add column if not exists last_name       text;
alter table public.profiles add column if not exists phone           text;
alter table public.profiles add column if not exists default_address jsonb;
alter table public.profiles add column if not exists created_at      timestamptz not null default now();
alter table public.profiles add column if not exists updated_at      timestamptz not null default now();

-- 2. updated_at TRIGGER --------------------------------------
-- Reuses public.set_updated_at() from 00_full_setup.sql; define
-- it here too so this migration stands alone.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- 3. ROW LEVEL SECURITY --------------------------------------
alter table public.profiles enable row level security;

-- Each authenticated user manages ONLY their own row (id = auth.uid()).
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 4. RELOAD POSTGREST SCHEMA CACHE ---------------------------
-- Force PostgREST to pick up the new table immediately instead
-- of waiting for its next reload.
notify pgrst, 'reload schema';
