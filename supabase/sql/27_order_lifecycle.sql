-- ============================================================
-- LE RASA BAKERY — 27_order_lifecycle.sql
-- ------------------------------------------------------------
-- Order approval workflow: every new order now WAITS for the owner
-- to accept it before it enters fulfilment.
--
--   Pending → (owner accepts) → Received → Preparing → Ready
--           → Out For Delivery → Delivered
--
-- A customer may cancel ONLY while Pending; a Pending order the owner
-- never accepts is auto-cancelled after 24h. Both paths issue a Stripe
-- refund and record it here.
--
-- Paste-and-run in the Supabase SQL Editor. Fully IDEMPOTENT and
-- ADDITIVE — safe to run repeatedly and safe on the live database.
-- Nothing here breaks existing orders: the code degrades gracefully
-- when these columns/values are absent, and existing 'received' orders
-- keep working exactly as before.
-- ============================================================

-- ------------------------------------------------------------
-- 1. STATUS values — widen the allowed set to include the two new
--    lifecycle states: 'pending' (awaiting owner acceptance) and
--    'ready' (baked, ready for delivery). 'refunded' is kept for
--    backward-compat with the existing admin refund tool.
--
--    We drop the old CHECK constraint (whatever it is named) and add a
--    fresh one. This runs in a DO block so a missing/renamed constraint
--    never errors the migration.
-- ------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
end$$;

alter table public.orders
  add constraint orders_status_check
  check (status in (
    'pending',
    'received',
    'preparing',
    'ready',
    'out_for_delivery',
    'delivered',
    'cancelled',
    'refunded'
  ));

-- ------------------------------------------------------------
-- 2. PAYMENT STATUS — tracked separately from the order status so a
--    Cancelled order can carry 'refunded' or 'refund_pending' while the
--    order status stays 'cancelled'. Every existing paid order defaults
--    to 'paid'.
-- ------------------------------------------------------------
alter table public.orders
  add column if not exists payment_status text not null default 'paid';

-- Recreate the payment_status CHECK defensively (idempotent).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_payment_status_check'
  ) then
    alter table public.orders drop constraint orders_payment_status_check;
  end if;
end$$;

alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('paid', 'refunded', 'refund_pending'));

-- ------------------------------------------------------------
-- 3. LIFECYCLE / REFUND LOG columns. refunded_at already exists from
--    the base schema; the rest are additive and nullable.
-- ------------------------------------------------------------
alter table public.orders add column if not exists accepted_at   timestamptz;
alter table public.orders add column if not exists cancelled_at  timestamptz;
alter table public.orders add column if not exists refunded_at   timestamptz;
alter table public.orders add column if not exists refund_id     text;
alter table public.orders add column if not exists refund_error  text;
-- Who/what actioned the cancellation: 'customer', 'auto', or an admin marker.
alter table public.orders add column if not exists cancelled_by  text;

-- ------------------------------------------------------------
-- 4. DEFAULT status for NEW orders is now 'pending'. Existing rows are
--    untouched. (The application also sets this explicitly on insert;
--    this keeps the DB self-consistent for any direct inserts.)
-- ------------------------------------------------------------
alter table public.orders alter column status set default 'pending';

-- ------------------------------------------------------------
-- 5. Index to make the 24h auto-cancel sweep cheap: it looks up
--    pending orders by age.
-- ------------------------------------------------------------
create index if not exists orders_pending_created_idx
  on public.orders (created_at)
  where status = 'pending';
