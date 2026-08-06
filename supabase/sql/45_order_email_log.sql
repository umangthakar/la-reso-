-- ============================================================
-- LE RASA BAKERY — 45_order_email_log.sql
-- ------------------------------------------------------------
-- DUPLICATE PROTECTION for the customer order emails.
--
-- Four transactional emails now go out over an order's life (lib/order-email):
--
--   order_placed     — the payment succeeded AND the order row exists
--   order_accepted   — pending → received (the owner accepted it)
--   order_cancelled  — cancelled by the admin, the customer, or the sweep
--   order_refunded   — Stripe confirmed the refund
--
-- Each of those must reach the customer AT MOST ONCE per order, and every
-- trigger point has a legitimate way of firing twice:
--
--   • the browser and the Stripe webhook both write the same order
--   • an admin double-clicks Accept, or the request is retried
--   • two auto-cancel sweeps overlap
--   • the admin retries a refund that already succeeded at Stripe
--
-- A per-process flag cannot cover that — serverless invocations do not share
-- memory, and the same order can be handled by two instances at once. So the
-- claim lives in the database, where the PRIMARY KEY serialises it: the first
-- INSERT wins and sends, a second gets 23505 and does nothing.
--
-- The row is also the audit trail (who it went to, when, and the error when a
-- send failed), which is what makes a failed send retryable: lib/order-email
-- writes status='failed', and the next attempt may re-claim that row — but
-- only that row, and only via a guarded conditional UPDATE, so a retry can
-- never turn into a duplicate delivery of an email that actually went out.
--
-- Paste-and-run in the Supabase SQL Editor. Fully IDEMPOTENT and ADDITIVE —
-- safe to run repeatedly and safe on the live database. NOT required for the
-- application to work: lib/order-email degrades to a best-effort in-process
-- guard when this table is absent, so emails still send (they just lose the
-- cross-instance duplicate guarantee until this is run).
-- ============================================================

-- ------------------------------------------------------------
-- 1. THE LEDGER — one row per (order, email type).
--
-- order_id is deliberately NOT a foreign key to public.orders: the ledger is
-- an audit record, and deleting an order must not silently erase the evidence
-- that we emailed the customer about it. It is also written from paths that
-- must never fail on a referential check.
--
-- status:
--   'pending' — claimed by a sender that is mid-flight
--   'sent'    — delivered to Resend (terminal; never re-claimed)
--   'failed'  — the send failed; re-claimable by a later attempt
-- ------------------------------------------------------------
create table if not exists public.order_email_log (
  order_id   uuid        not null,
  email_type text        not null,
  recipient  text,
  status     text        not null default 'pending',
  error      text,
  attempts   integer     not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (order_id, email_type)
);

comment on table public.order_email_log is
  'One row per (order, customer email type). The PRIMARY KEY is the duplicate-send guard used by lib/order-email; the row doubles as the delivery audit trail.';

-- Additive on an existing table (safe to re-run after an older shape).
alter table public.order_email_log add column if not exists recipient  text;
alter table public.order_email_log add column if not exists error      text;
alter table public.order_email_log add column if not exists attempts   integer not null default 1;
alter table public.order_email_log add column if not exists updated_at timestamptz not null default now();

-- Only the three states above are meaningful. Dropped and re-added so the
-- file stays re-runnable after the set is ever widened.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_email_log'::regclass
      and conname  = 'order_email_log_status_check'
  ) then
    alter table public.order_email_log drop constraint order_email_log_status_check;
  end if;
end$$;

alter table public.order_email_log
  add constraint order_email_log_status_check
  check (status in ('pending', 'sent', 'failed'));

-- ------------------------------------------------------------
-- 2. INDEXES — the admin/audit reads.
--
-- The primary key already covers the hot path (claim by order + type). These
-- support "what went out recently?" and "what is stuck failed?".
-- ------------------------------------------------------------
create index if not exists order_email_log_created_at_idx
  on public.order_email_log (created_at desc);

create index if not exists order_email_log_status_idx
  on public.order_email_log (status)
  where status <> 'sent';

-- ------------------------------------------------------------
-- 3. RLS — service role only.
--
-- This table records customer email addresses against order ids. Nothing in
-- the storefront reads it: every writer (lib/order-email) runs server-side
-- with the service-role key, which is exempt from RLS. Enabling RLS with NO
-- policies therefore denies anon and authenticated outright, which is exactly
-- the intent — same posture as the other server-only ledgers.
-- ------------------------------------------------------------
alter table public.order_email_log enable row level security;

revoke all on public.order_email_log from anon, authenticated;

-- ------------------------------------------------------------
-- 4. BACKFILL — nothing to do.
--
-- Orders placed before this migration have no ledger rows, so a lifecycle
-- email for one of them (e.g. cancelling an old pending order) claims its row
-- on first use and behaves exactly like a new order. No historical email is
-- re-sent, because the emails only fire on a live state transition.
-- ------------------------------------------------------------
