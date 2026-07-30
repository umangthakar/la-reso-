-- ============================================================
-- 38_input_validation.sql — database-level guards for customer input
-- ------------------------------------------------------------
-- WHY THIS EXISTS
-- Every other customer form posts to an API route, where lib/input-validation.ts
-- re-checks the payload server-side. The account profile form is the exception:
-- app/account/complete-profile/page.tsx writes to `profiles` DIRECTLY from the
-- browser via supabase-js, so there is no route to validate in. Anyone holding a
-- session token could PATCH that row with "John123" or "abcde" for a phone.
--
-- These CHECK constraints are therefore the server-side enforcement for that
-- path, and defence in depth for the routed ones (orders, custom_inquiries).
--
-- The rules mirror lib/input-validation.ts:
--   names  — letters (incl. accented), spaces, hyphens, apostrophes; 2..100
--   phones — digits with one optional leading "+", 7..15 digits
-- Postgres regex classes are used so the letter rules cover accents without
-- spelling out codepoint ranges.
--
-- SAFETY: every constraint is NOT VALID, so it applies to new and updated rows
-- but does NOT fail on pre-existing data that predates these rules. Validate
-- them later, once any legacy rows are cleaned up, with:
--   ALTER TABLE profiles VALIDATE CONSTRAINT profiles_first_name_format;
--
-- Idempotent: safe to run more than once.
-- ============================================================

-- ── profiles (written client-side — the important one) ──────

alter table if exists public.profiles
  drop constraint if exists profiles_first_name_format;
alter table if exists public.profiles
  add constraint profiles_first_name_format check (
    first_name is null
    or first_name ~ '^[[:alpha:]][[:alpha:]]*([ ''’-][[:alpha:]]+)*$'
    and char_length(first_name) between 2 and 100
  ) not valid;

alter table if exists public.profiles
  drop constraint if exists profiles_last_name_format;
alter table if exists public.profiles
  add constraint profiles_last_name_format check (
    last_name is null
    or last_name ~ '^[[:alpha:]][[:alpha:]]*([ ''’-][[:alpha:]]+)*$'
    and char_length(last_name) between 2 and 100
  ) not valid;

-- Phone: stored as typed, so allow the separators a human might leave in, but
-- require 7..15 actual digits and no letters.
alter table if exists public.profiles
  drop constraint if exists profiles_phone_format;
alter table if exists public.profiles
  add constraint profiles_phone_format check (
    phone is null
    or phone = ''
    or (
      phone ~ '^\+?[0-9 ]+$'
      and char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 7 and 15
    )
  ) not valid;

-- ── orders (also validated in /api/orders/create) ───────────

alter table if exists public.orders
  drop constraint if exists orders_email_format;
alter table if exists public.orders
  add constraint orders_email_format check (
    email is null
    or email = ''
    or email ~ '^[^[:space:]@]+@[^[:space:]@.]+(\.[^[:space:]@.]+)*\.[A-Za-z]{2,}$'
  ) not valid;

alter table if exists public.orders
  drop constraint if exists orders_phone_format;
alter table if exists public.orders
  add constraint orders_phone_format check (
    phone is null
    or phone = ''
    or (
      phone ~ '^\+?[0-9 ]+$'
      and char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 7 and 15
    )
  ) not valid;

-- ── custom_inquiries (also validated in /api/inquiry/create) ─

alter table if exists public.custom_inquiries
  drop constraint if exists custom_inquiries_email_format;
alter table if exists public.custom_inquiries
  add constraint custom_inquiries_email_format check (
    email is null
    or email = ''
    or email ~ '^[^[:space:]@]+@[^[:space:]@.]+(\.[^[:space:]@.]+)*\.[A-Za-z]{2,}$'
  ) not valid;

alter table if exists public.custom_inquiries
  drop constraint if exists custom_inquiries_phone_format;
alter table if exists public.custom_inquiries
  add constraint custom_inquiries_phone_format check (
    phone is null
    or phone = ''
    or (
      phone ~ '^\+?[0-9 ]+$'
      and char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 7 and 15
    )
  ) not valid;
