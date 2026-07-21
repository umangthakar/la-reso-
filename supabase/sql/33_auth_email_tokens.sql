-- ============================================================
-- LE RASA BAKERY — Auth email tokens (verification + password reset).
-- ------------------------------------------------------------
-- Paste-and-run in the Supabase SQL Editor. IDEMPOTENT and ADDITIVE — safe to
-- run repeatedly. Does NOT touch any existing table.
--
-- Groundwork ONLY for the future migration of auth emails off Supabase SMTP
-- (see lib/auth-email.ts). Nothing reads or writes these tables yet.
--
-- Access model mirrors `orders` / `custom_inquiries`: RLS is ENABLED with NO
-- policies, so anon/authenticated clients get nothing. Every read/write is
-- expected to go through a service-role API route (the service role bypasses
-- RLS). Tokens are secrets — they must never be exposed to the browser.
--
--   1. email_verification_tokens
--   2. password_reset_tokens
--   3. cleanup_auth_email_tokens()   (deletes expired/consumed rows)
-- ============================================================


-- ------------------------------------------------------------
-- 1. EMAIL VERIFICATION TOKENS
--    `user_id` is nullable + ON DELETE CASCADE: Supabase may create the auth
--    user before/after issuance, and deleting a user cleans up their tokens.
--    `verified_at` = when the link was confirmed; `used_at` = when the token
--    was consumed by the flow (kept distinct so both are auditable).
-- ------------------------------------------------------------
create table if not exists public.email_verification_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  email        text not null,
  token        text not null unique,
  expires_at   timestamptz not null,
  verified_at  timestamptz,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_email_verification_tokens_user_id
  on public.email_verification_tokens (user_id);
create index if not exists idx_email_verification_tokens_email
  on public.email_verification_tokens (email);
create index if not exists idx_email_verification_tokens_expires_at
  on public.email_verification_tokens (expires_at);

-- RLS on, zero policies → only the service role can touch it.
alter table public.email_verification_tokens enable row level security;
-- Belt-and-braces: no direct grants to browser-facing roles.
revoke all on public.email_verification_tokens from anon, authenticated;


-- ------------------------------------------------------------
-- 2. PASSWORD RESET TOKENS
--    Same shape. `verified_at` marks the moment the link was validated;
--    `used_at` marks the moment the new password was actually set. A reset
--    link is single-use: the flow must reject any row where used_at is set or
--    expires_at has passed.
-- ------------------------------------------------------------
create table if not exists public.password_reset_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  email        text not null,
  token        text not null unique,
  expires_at   timestamptz not null,
  verified_at  timestamptz,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_password_reset_tokens_user_id
  on public.password_reset_tokens (user_id);
create index if not exists idx_password_reset_tokens_email
  on public.password_reset_tokens (email);
create index if not exists idx_password_reset_tokens_expires_at
  on public.password_reset_tokens (expires_at);

alter table public.password_reset_tokens enable row level security;
revoke all on public.password_reset_tokens from anon, authenticated;


-- ------------------------------------------------------------
-- 3. CLEANUP
--    Deletes tokens that are expired OR already consumed (used_at set). Safe
--    to call as often as you like. Run manually, or schedule with pg_cron:
--
--      select cron.schedule(
--        'purge-auth-email-tokens', '0 * * * *',
--        $$ select public.cleanup_auth_email_tokens(); $$
--      );
--
--    SECURITY DEFINER so a scheduled job (or service role) can run it despite
--    RLS; search_path pinned to avoid hijacking.
-- ------------------------------------------------------------
create or replace function public.cleanup_auth_email_tokens()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer := 0;
  n integer;
begin
  delete from public.email_verification_tokens
    where expires_at < now() or used_at is not null;
  get diagnostics n = row_count;
  deleted := deleted + n;

  delete from public.password_reset_tokens
    where expires_at < now() or used_at is not null;
  get diagnostics n = row_count;
  deleted := deleted + n;

  return deleted;
end;
$$;

-- Only the service role should invoke cleanup.
revoke all on function public.cleanup_auth_email_tokens() from anon, authenticated;

-- One-off manual purge (equivalent to the function body):
--   delete from public.email_verification_tokens where expires_at < now() or used_at is not null;
--   delete from public.password_reset_tokens      where expires_at < now() or used_at is not null;
