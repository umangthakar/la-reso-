-- ============================================================
-- Le Rasa Bakery — 14_orders_realtime_broadcast.sql
-- ------------------------------------------------------------
-- Makes the admin Orders table + Dashboard update INSTANTLY when an
-- order is placed or its status changes, without a page refresh.
--
-- WHY A BROADCAST (and not plain postgres_changes):
-- The admin dashboard uses the public anon key in the browser. The only
-- SELECT policy on `orders` is "read your OWN order by tracking token",
-- and Supabase Realtime enforces RLS per row — so an anon
-- postgres_changes subscription on `orders` receives ZERO admin events.
--
-- Instead, this trigger BROADCASTS a lightweight message on every
-- INSERT/UPDATE/DELETE. Broadcast messages are delivered to subscribers
-- of the topic and are NOT row-RLS-filtered, so the admin (anon key)
-- reliably hears every order change. The client then refetches the
-- authoritative rows through the service-role admin API.
--
-- Client side: lib/supabase/hooks/use-orders-live.ts subscribes to the
-- topic below and listens for the 'order_changed' event.
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- Broadcast function. SECURITY DEFINER so it can call realtime.send
-- regardless of the (server-side) role that performed the write.
create or replace function public.broadcast_order_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  -- realtime.send(payload jsonb, event text, topic text, private boolean)
  -- private => false makes it a public broadcast the anon admin can receive
  -- without a realtime.messages RLS policy.
  perform realtime.send(
    jsonb_build_object(
      'op',     tg_op,
      'id',     coalesce(new.id, old.id),
      'status', coalesce(new.status, old.status)
    ),
    'order_changed',      -- event name (matches the client .on('broadcast', …))
    'admin:orders:live',  -- topic (matches supabaseBrowser.channel(ORDERS_LIVE_TOPIC))
    false                 -- public broadcast
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_orders_broadcast on public.orders;
create trigger trg_orders_broadcast
  after insert or update or delete on public.orders
  for each row execute function public.broadcast_order_change();
