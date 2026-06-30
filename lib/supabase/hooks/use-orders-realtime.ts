"use client";

// ============================================================
// ADMIN order dashboard — realtime orders feed (all events)
// ------------------------------------------------------------
// Subscribes to INSERT/UPDATE/DELETE on the `orders` table and keeps a
// live list in sync for the admin dashboard.
//
// ⚠️ AUTH PREREQUISITE (see supabase/README.md):
// This hook uses the public anon client. With the schema as-is, the only
// SELECT policy on `orders` matches a customer's own order (by tracking
// token or auth_user_id) — there is NO admin SELECT policy. Realtime
// postgres_changes enforces RLS, so over the anon key this subscription
// will receive ZERO order events.
//
// To make this dashboard work you need ONE of:
//   (a) a real admin Supabase Auth session + an "admins can select all
//       orders" RLS policy (recommended — then this hook's anon client
//       should be swapped for the authenticated session client), or
//   (b) a server-side push channel (Broadcast from a trigger) the admin
//       subscribes to instead of postgres_changes.
// This is wired now so the dashboard is ready; flip on (a) with the admin
// panel + keys.
// ============================================================

import { useEffect, useRef, useState } from "react";
import type {
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Database, Order } from "@/lib/supabase/database.types";

type Options = {
  /**
   * Client to subscribe with. Defaults to the anon browser client, but pass
   * the authenticated admin session client here once admin auth exists so
   * RLS authorizes the subscription.
   */
  client?: SupabaseClient<Database>;
  onChange?: (payload: RealtimePostgresChangesPayload<Order>) => void;
};

export function useOrdersRealtime(
  initialOrders: Order[],
  options: Options = {},
): Order[] {
  const { client = supabaseBrowser, onChange } = options;
  const [orders, setOrders] = useState<Order[]>(initialOrders);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const channel = client
      .channel("admin:orders")
      .on<Order>(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          onChangeRef.current?.(payload);

          setOrders((prev) => {
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as Partial<Order>)?.id;
              return oldId ? prev.filter((o) => o.id !== oldId) : prev;
            }

            const row = payload.new as Order;
            const idx = prev.findIndex((o) => o.id === row.id);
            if (idx === -1) {
              // Newest first.
              return [row, ...prev];
            }
            const next = [...prev];
            next[idx] = row;
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [client]);

  return orders;
}
