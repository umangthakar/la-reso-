"use client";

// ============================================================
// CUSTOMER order tracking — realtime status history for ONE order
// ------------------------------------------------------------
// Flow (token-based, no login):
//   1. Build a tracking client that sends `x-tracking-token`.
//   2. REST fetch the order (by token) + its status history. RLS matches
//      the header to the row's tracking_token, so the customer sees ONLY
//      their own order. ✅ This part is fully secured by RLS.
//   3. Subscribe to order_status_history changes for this order_id.
//
// ⚠️ REALTIME CAVEAT (confirmed against Supabase behaviour; see
//    supabase/README.md): custom request headers are NOT sent over the
//    Realtime WebSocket, so the RLS policy that reads
//    current_setting('request.headers')->>'x-tracking-token' evaluates to
//    false during postgres_changes. Net effect: the REST fetch works, but
//    this subscription will receive NO live rows under the current schema.
//    It fails CLOSED (no data leak), but live updates won't arrive.
//
//    To get real live updates, pick one (needs confirmation before I build):
//      (a) mint a short-lived JWT carrying the order_id/token as a claim,
//          pass it as the realtime access token, and add an RLS policy that
//          reads the claim from auth.jwt()  — recommended; or
//      (b) Broadcast from an order_status_history trigger to a private topic
//          keyed by tracking_token (Realtime Authorization).
//    Until then, `refetch()` (returned below) gives a manual/poll fallback.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { createTrackingClient } from "@/lib/supabase/client";
import type { Order, OrderStatusHistory } from "@/lib/supabase/database.types";

type TrackingState = {
  order: Order | null;
  history: OrderStatusHistory[];
  loading: boolean;
  error: string | null;
  /** Manual re-fetch (REST, header-authorized). Use as the poll fallback. */
  refetch: () => Promise<void>;
};

export function useOrderTrackingRealtime(
  trackingToken: string | null | undefined,
): TrackingState {
  const [order, setOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(trackingToken));
  const [error, setError] = useState<string | null>(null);

  // One client per token, stable across renders.
  const clientRef = useRef<ReturnType<typeof createTrackingClient> | null>(null);
  if (trackingToken && !clientRef.current) {
    clientRef.current = createTrackingClient(trackingToken);
  }

  const refetch = useCallback(async () => {
    const client = clientRef.current;
    if (!client || !trackingToken) return;
    setLoading(true);
    setError(null);

    const { data: orderRow, error: orderErr } = await client
      .from("orders")
      .select("*")
      .eq("tracking_token", trackingToken)
      .maybeSingle();

    if (orderErr) {
      setError(orderErr.message);
      setLoading(false);
      return;
    }
    setOrder(orderRow);

    if (orderRow) {
      const { data: rows, error: histErr } = await client
        .from("order_status_history")
        .select("*")
        .eq("order_id", orderRow.id)
        .order("created_at", { ascending: true });
      if (histErr) setError(histErr.message);
      else setHistory(rows ?? []);
    }
    setLoading(false);
  }, [trackingToken]);

  useEffect(() => {
    if (!trackingToken) return;
    const client = clientRef.current;
    if (!client) return;

    let active = true;
    void refetch();

    // Subscription is filtered to this order. NOTE the realtime caveat above:
    // under the current header-based RLS this will not emit rows. Kept here so
    // that enabling approach (a)/(b) makes it "just work" with no UI changes.
    let channel: ReturnType<typeof client.channel> | null = null;

    (async () => {
      // We need the order id to filter the subscription.
      const { data: orderRow } = await client
        .from("orders")
        .select("id")
        .eq("tracking_token", trackingToken)
        .maybeSingle();
      if (!active || !orderRow) return;

      channel = client
        .channel(`tracking:order:${orderRow.id}`)
        .on<OrderStatusHistory>(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "order_status_history",
            filter: `order_id=eq.${orderRow.id}`,
          },
          (payload: RealtimePostgresInsertPayload<OrderStatusHistory>) => {
            setHistory((prev) => {
              if (prev.some((h) => h.id === payload.new.id)) return prev;
              return [...prev, payload.new].sort((a, b) =>
                a.created_at.localeCompare(b.created_at),
              );
            });
            // Keep the order's status field fresh too.
            setOrder((prev) =>
              prev ? { ...prev, status: payload.new.status as Order["status"] } : prev,
            );
          },
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) client.removeChannel(channel);
    };
  }, [trackingToken, refetch]);

  return { order, history, loading, error, refetch };
}
