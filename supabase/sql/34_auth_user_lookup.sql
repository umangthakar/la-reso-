-- ============================================================
-- LE RASA BAKERY — Auth user lookup helper (for token-based auth emails).
-- ------------------------------------------------------------
-- Paste-and-run in the Supabase SQL Editor. IDEMPOTENT and ADDITIVE — does NOT
-- modify any table. Companion to 33_auth_email_tokens.sql.
--
-- supabase-js exposes no "get user by email", and the `auth` schema is not
-- reachable through PostgREST, so the forgot-password / reset-password routes
-- need a controlled way to resolve an email → auth user id. This SECURITY
-- DEFINER function does exactly that and nothing more.
--
-- Locked down: execute is revoked from anon/authenticated, so ONLY the service
-- role (server-side API routes) can call it. It returns a bare uuid (or NULL),
-- never any other user data.
-- ============================================================

create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
stable
as $$
  select id
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.get_user_id_by_email(text) from anon, authenticated;
