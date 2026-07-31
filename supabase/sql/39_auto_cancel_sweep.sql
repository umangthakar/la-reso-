-- ============================================================
-- LE RASA BAKERY — 39_auto_cancel_sweep.sql
-- ------------------------------------------------------------
-- Transactional support for the hourly 24h auto-cancel sweep
-- (/api/cron/auto-cancel, scheduled in vercel.json).
--
-- WHY THIS EXISTS. The sweep does three things per order that must not
-- come apart: claim the order, refund it at Stripe, record the outcome.
-- Done from the client with separate SELECT + UPDATE calls there is a
-- window between reading a Pending order and cancelling it in which the
-- owner can accept it, the customer can cancel it, or an overlapping run
-- of the same sweep can pick it up — and the loser of that race still
-- reaches Stripe. These two functions move each half into ONE statement
-- inside ONE transaction, so the race is closed in the database rather
-- than hoped away in application code.
--
-- Paste-and-run in the Supabase SQL Editor. Fully IDEMPOTENT and
-- ADDITIVE — safe to run repeatedly and safe on the live database.
-- Requires 27_order_lifecycle.sql (payment_status, refund_id,
-- cancelled_at, cancelled_by). The application degrades gracefully when
-- these functions are absent, so nothing breaks before you run it.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ELIGIBILITY INDEX
--
-- 27 indexes (created_at) where status = 'pending'. The sweep now also
-- filters on payment_status and refund_id, so index the exact predicate
-- it uses. Partial, so it stays tiny: only unaccepted, paid, unrefunded
-- orders are in it, and rows leave the index the moment they are swept.
-- ------------------------------------------------------------
create index if not exists orders_auto_cancel_sweep_idx
  on public.orders (created_at)
  where status = 'pending'
    and payment_status = 'paid'
    and refund_id is null;

-- ------------------------------------------------------------
-- 2. CLAIM — atomically take ownership of the orders due for sweeping.
--
-- One statement, one transaction:
--   * the inner SELECT picks eligible orders and locks them with
--     FOR UPDATE SKIP LOCKED, so two concurrent sweeps (an hourly run
--     overlapping a manual trigger) each get a DISJOINT set instead of
--     fighting over the same rows or blocking on each other;
--   * the outer UPDATE flips them to 'cancelled' and returns the full
--     rows the caller needs to issue the refund.
--
-- Because the claim commits BEFORE any Stripe call, an order can only be
-- handed to one caller — the refund is issued by whoever won the row.
--
-- The claim also moves payment_status 'paid' → 'refund_pending', i.e. "this
-- money is owed back". That matters if the serverless invocation dies between
-- the claim and the refund: the order is no longer 'pending', so a later sweep
-- will not find it, but it now shows up exactly where the admin refund-retry
-- tool looks (payment_status = 'refund_pending'). Without this an interrupted
-- run would strand a cancelled order with the customer's money still held and
-- nothing anywhere flagging it. auto_cancel_finalize promotes it to 'refunded'
-- once Stripe confirms.
--
-- ELIGIBILITY (all four must hold):
--   status = 'pending'         — the owner never accepted it
--   payment_status = 'paid'    — the customer's money is actually held
--   refund_id is null          — never refunded before
--   created_at < p_cutoff      — older than the caller's 24h cutoff
--
-- p_limit bounds the batch so a single serverless invocation cannot run
-- past its execution budget; the caller loops until nothing is returned.
-- ------------------------------------------------------------
create or replace function public.auto_cancel_claim_orders(
  p_cutoff timestamptz,
  p_limit  integer default 25
)
returns setof public.orders
language sql
security definer
set search_path = public, pg_temp
as $$
  with due as (
    select id
      from public.orders
     where status         = 'pending'
       and payment_status = 'paid'
       and refund_id is null
       and refunded_at is null
       and created_at < p_cutoff
     order by created_at
     limit greatest(coalesce(p_limit, 25), 0)
       for update skip locked
  )
  update public.orders o
     set status         = 'cancelled',
         payment_status = 'refund_pending',
         cancelled_at   = now(),
         cancelled_by   = 'auto',
         updated_at     = now()
    from due
   where o.id = due.id
  returning o.*;
$$;

comment on function public.auto_cancel_claim_orders(timestamptz, integer) is
  'Atomically claim up to p_limit pending, paid, unrefunded orders older than '
  'p_cutoff, marking them cancelled + refund_pending and returning the claimed '
  'rows. Used by the hourly auto-cancel sweep; SKIP LOCKED makes concurrent '
  'runs disjoint.';

-- ------------------------------------------------------------
-- 3. FINALIZE — record the outcome of the Stripe refund.
--
-- The second half of the transaction pair, again one statement:
-- payment_status, refund_id, refund_error and refunded_at are written
-- together or not at all, so an order can never be left claiming
-- 'refunded' with no refund id attached (or the reverse).
--
--   p_refund_id given → payment_status 'refunded', error cleared
--   p_refund_id null  → payment_status 'refund_pending', error stored
--                       for the admin retry tool
--
-- Idempotent: refund_id and refunded_at are only ever set once (coalesce
-- keeps the first value), so replaying a finalize cannot rewrite the
-- record of a refund that already happened.
-- ------------------------------------------------------------
create or replace function public.auto_cancel_finalize(
  p_order_id     uuid,
  p_refund_id    text default null,
  p_refund_error text default null
)
returns setof public.orders
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.orders
     set status         = 'cancelled',
         payment_status = case
                            when nullif(btrim(coalesce(p_refund_id, '')), '') is not null
                            then 'refunded'
                            else 'refund_pending'
                          end,
         refund_id      = coalesce(refund_id, nullif(btrim(coalesce(p_refund_id, '')), '')),
         refund_error   = case
                            when nullif(btrim(coalesce(p_refund_id, '')), '') is not null
                            then null
                            else nullif(btrim(coalesce(p_refund_error, '')), '')
                          end,
         refunded_at    = case
                            when nullif(btrim(coalesce(p_refund_id, '')), '') is not null
                            then coalesce(refunded_at, now())
                            else refunded_at
                          end,
         updated_at     = now()
   where id = p_order_id
  returning *;
$$;

comment on function public.auto_cancel_finalize(uuid, text, text) is
  'Record a refund outcome for a cancelled order in one transaction: sets '
  'payment_status refunded/refund_pending together with refund_id, '
  'refund_error and refunded_at. Safe to replay.';

-- ------------------------------------------------------------
-- 4. GRANTS — server-side callers only.
--
-- Both functions are SECURITY DEFINER and cancel orders + move money, so
-- EXECUTE is revoked from the browser-facing roles and granted only to
-- service_role (the key the cron route uses). PUBLIC is revoked first
-- because Postgres grants EXECUTE to PUBLIC by default.
-- ------------------------------------------------------------
revoke all on function public.auto_cancel_claim_orders(timestamptz, integer) from public;
revoke all on function public.auto_cancel_claim_orders(timestamptz, integer) from anon, authenticated;
grant execute on function public.auto_cancel_claim_orders(timestamptz, integer) to service_role;

revoke all on function public.auto_cancel_finalize(uuid, text, text) from public;
revoke all on function public.auto_cancel_finalize(uuid, text, text) from anon, authenticated;
grant execute on function public.auto_cancel_finalize(uuid, text, text) to service_role;

-- ------------------------------------------------------------
-- 5. Make PostgREST pick the new functions up immediately, instead of
--    waiting for its schema cache to expire (otherwise the first calls
--    come back "Could not find the function ... in the schema cache").
-- ------------------------------------------------------------
notify pgrst, 'reload schema';
