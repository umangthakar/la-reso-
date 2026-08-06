-- ============================================================
-- LE RASA BAKERY — 44_stripe_webhook.sql
-- ------------------------------------------------------------
-- Production reliability for Stripe payments.
--
-- WHY THIS EXISTS. Orders are written by the customer's BROWSER after Stripe
-- confirms the payment (/api/orders/create). If that tab closes, crashes or
-- loses signal in the moment after the card is charged, the money is taken and
-- no order exists. /api/stripe/webhook is the server-side safety net, and this
-- migration gives it the three things it needs:
--
--   1. A unique index on orders.stripe_payment_intent, so the browser and one
--      or more webhook deliveries racing on the same payment can only ever
--      produce ONE order. This is the durable idempotency guarantee.
--   2. checkout_drafts — the basket and delivery details, written when the
--      PaymentIntent is created, so a recovered order is identical to the one
--      the browser would have saved rather than a stub.
--   3. stripe_webhook_events — an event-id ledger, so a duplicate delivery is
--      a no-op.
--
-- Paste-and-run in the Supabase SQL Editor. Fully IDEMPOTENT and ADDITIVE —
-- safe to run repeatedly and safe on the live database. Nothing here is
-- required for the EXISTING checkout to keep working: the application degrades
-- gracefully when these objects are absent (recovery falls back to the
-- PaymentIntent's own metadata), so running it is an upgrade, never a cutover.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ONE ORDER PER PAYMENT — the idempotency guarantee.
--
-- /api/orders/create has always checked for an existing order before
-- inserting, but a check-then-insert has a window: two concurrent writers can
-- both pass the check. Now that a webhook can write the same order as the
-- browser, that window is real, so the rule moves into the database where it
-- cannot be raced. The application already handles 23505 by adopting the row
-- the other writer created.
--
-- Partial, because legacy/manual orders may have no PaymentIntent at all and
-- must not collide with each other on NULL.
--
-- If this fails with a duplicate-key error, the database already contains
-- more than one order for a single PaymentIntent. Find them with:
--   select stripe_payment_intent, count(*), array_agg(id)
--     from public.orders
--    where stripe_payment_intent is not null
--    group by 1 having count(*) > 1;
-- Delete or merge the extras, then re-run this file.
-- ------------------------------------------------------------
create unique index if not exists orders_stripe_payment_intent_key
  on public.orders (stripe_payment_intent)
  where stripe_payment_intent is not null;

-- ------------------------------------------------------------
-- 2. CHECKOUT DRAFTS — what the browser was about to save.
--
-- Written by /api/checkout/create-intent at the moment the PaymentIntent is
-- created, read by the webhook only when the browser never completed the
-- order, and DELETED as soon as an order exists. It therefore holds personal
-- data (name, phone, delivery address) for minutes in the normal case — see
-- the sweep in section 4 for the abandoned ones.
-- ------------------------------------------------------------
create table if not exists public.checkout_drafts (
  payment_intent_id text primary key,
  payload           jsonb       not null,
  created_at        timestamptz not null default now()
);

comment on table public.checkout_drafts is
  'Short-lived checkout details keyed by Stripe PaymentIntent, used by /api/stripe/webhook to recover an order the customer''s browser never saved. Deleted once the order exists.';

-- Supports the sweep in section 4.
create index if not exists checkout_drafts_created_at_idx
  on public.checkout_drafts (created_at);

-- ------------------------------------------------------------
-- 3. WEBHOOK EVENT LEDGER — duplicate delivery suppression.
--
-- Stripe delivers at-least-once and retries for days, so the same event id
-- arrives more than once as a matter of course. The primary key is the
-- claim: the first insert wins, a second gets 23505 and the endpoint
-- acknowledges without re-running the handler.
-- ------------------------------------------------------------
create table if not exists public.stripe_webhook_events (
  event_id     text primary key,
  type         text,
  received_at  timestamptz not null default now()
);

-- The COMPLETION MARKER, and the reason the row alone is not a tombstone.
--
-- Claiming on insert stops a duplicate delivery re-running a handler, but it
-- stakes the claim before the work is done. If the process dies mid-handler —
-- a serverless timeout while waiting on Stripe or a notification provider, an
-- OOM kill, a deploy — the row survives, Stripe's retry is dismissed as a
-- duplicate, and the order that retry existed to save is lost for good.
--
-- So handled_at, not the row, is what marks an event finished. A claim still
-- null here means the previous attempt never completed and the event is
-- handled again — safe, because order creation is idempotent per PaymentIntent
-- and refund recording never overwrites a refund already on the order.
--
-- Added separately from the create table above so databases that ran an
-- earlier copy of this file pick it up on a re-run.
alter table public.stripe_webhook_events
  add column if not exists handled_at timestamptz;

comment on table public.stripe_webhook_events is
  'One row per Stripe event id seen by /api/stripe/webhook. handled_at set = finished, so a duplicate delivery is ignored; null = the attempt died mid-flight, so a retry is handled again.';

create index if not exists stripe_webhook_events_received_at_idx
  on public.stripe_webhook_events (received_at);

-- ------------------------------------------------------------
-- 4. RETENTION SWEEP.
--
-- Drafts for payments that were never completed would otherwise keep the
-- customer's details forever, and the event ledger only needs to cover
-- Stripe's retry window (a few days). Call it from the existing hourly cron,
-- or run it by hand — nothing depends on it having run.
-- ------------------------------------------------------------
create or replace function public.sweep_stripe_reliability_tables()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.checkout_drafts       where created_at  < now() - interval '7 days';
  delete from public.stripe_webhook_events where received_at < now() - interval '30 days';
$$;

revoke all on function public.sweep_stripe_reliability_tables() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. LOCK BOTH TABLES DOWN.
--
-- Neither table is ever touched by a browser: both are written and read only
-- by server routes using the SERVICE ROLE key, which is exempt from RLS and
-- from these grants. Enabling RLS with NO policies means anon/authenticated
-- get nothing even if a grant is ever added by accident — the same posture
-- 43_critical_security_fixes.sql applies to orders.
-- ------------------------------------------------------------
alter table public.checkout_drafts       enable row level security;
alter table public.stripe_webhook_events enable row level security;

revoke all on public.checkout_drafts       from anon, authenticated;
revoke all on public.stripe_webhook_events from anon, authenticated;

-- ------------------------------------------------------------
-- 6. VERIFY — RUN THIS. Do not assume the file applied.
--
-- Section 1 is the one part that can fail on its own (pre-existing duplicate
-- PaymentIntents), and a database with the tables but WITHOUT the unique index
-- looks migrated while missing the actual idempotency guarantee. This block is
-- executable, not a comment, so a partial apply is impossible to miss.
-- ------------------------------------------------------------
select
  'orders unique index'            as check,
  case when exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'orders'
       and indexname = 'orders_stripe_payment_intent_key'
  ) then 'OK' else 'MISSING — duplicate orders are possible' end as result
union all
select
  'checkout_drafts table',
  case when to_regclass('public.checkout_drafts') is not null
       then 'OK' else 'MISSING' end
union all
select
  'stripe_webhook_events table',
  case when to_regclass('public.stripe_webhook_events') is not null
       then 'OK' else 'MISSING' end
union all
select
  'handled_at column',
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'stripe_webhook_events'
       and column_name = 'handled_at'
  ) then 'OK' else 'MISSING — a crashed handler would lose the retry' end
union all
select
  'no browser grants',
  case when exists (
    select 1 from information_schema.role_table_grants
     where table_name in ('checkout_drafts','stripe_webhook_events')
       and grantee in ('anon','authenticated')
  ) then 'FAIL — a browser role can reach these tables' else 'OK' end;
