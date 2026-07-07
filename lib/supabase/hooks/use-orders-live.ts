"use client";

// ============================================================
// Le Rasa Bakery — ADMIN "orders changed" live signal
// ------------------------------------------------------------
// Fires `onChange()` whenever the `orders` table changes, so the admin
// Orders table and Dashboard cards can refetch authoritative data (via
// the service-role admin API) without a page refresh.
//
// WHY THIS SHAPE (and not a bare postgres_changes subscription):
// The only SELECT RLS policy on `orders` is "read your OWN order by
// tracking token" — there is no admin/anon select-all policy, and orders
// are inserted server-side with the service role. Supabase Realtime
// enforces RLS per row, so a plain anon
//   channel.on('postgres_changes', { table: 'orders' }, …)
// SUBSCRIBES fine but receives ZERO order events for the admin. See
// supabase/README.md + the project memory "supabase-realtime-rls-gaps".
//
// So this hook listens on THREE paths and any of them triggers a refetch:
//   1. postgres_changes — kept as requested; delivers instantly IF an
//      admin SELECT policy / admin auth is ever added (harmless until then).
//   2. broadcast 'order_changed' — a DB trigger broadcasts on every
//      INSERT/UPDATE/DELETE (see supabase/sql/14_orders_realtime_broadcast.sql).
//      Broadcast is NOT row-RLS-filtered, so this is the reliable instant path.
//   3. a visibility-aware poll — guarantees new orders still appear within
//      `pollMs` even before that SQL migration is run, and as a safety net.
//      Defaults to a fast 3s so the admin recovers from any missed realtime
//      event (or a slow/failed subscription) almost immediately.
//
// The callback is debounced so a burst of events causes a single refetch.
// ============================================================

import { useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Realtime topic shared by the client channel and the DB broadcast trigger. */
export const ORDERS_LIVE_TOPIC = "admin:orders:live";

type Options = {
  /** Fallback poll interval in ms (only fires while the tab is visible). */
  pollMs?: number;
};

export function useOrdersLive(onChange: () => void, options: Options = {}): void {
  // 3s fallback: if the realtime subscription is slow, drops an event, or the
  // broadcast trigger isn't installed, the admin still catches up within 3s.
  const { pollMs = 3_000 } = options;

  // Keep the latest callback without re-subscribing on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let disposed = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    // Coalesce a burst of signals into one refetch.
    const fire = () => {
      if (disposed) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (!disposed) onChangeRef.current();
      }, 300);
    };

    const channel = supabaseBrowser
      .channel(ORDERS_LIVE_TOPIC)
      // Path 1 — postgres_changes (as requested). No-op until an admin
      // SELECT policy exists, but instant once it does.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        fire,
      )
      // Path 2 — broadcast from the DB trigger (RLS-proof, reliable).
      .on("broadcast", { event: "order_changed" }, fire)
      .subscribe();

    // Path 3 — visibility-aware polling fallback.
    const poll = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fire();
    }, pollMs);

    // Refresh immediately when the tab regains focus (catches anything
    // missed while it was backgrounded).
    const onVisible = () => {
      if (document.visibilityState === "visible") fire();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      if (debounce) clearTimeout(debounce);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      supabaseBrowser.removeChannel(channel);
    };
    // pollMs is captured once; changing it at runtime isn't a use case here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
