"use client";

// ============================================================
// useActiveOffer — client hook for the live, resolved storefront offer.
//
// Same shape/discipline as lib/use-site-settings.ts: fetches
// /api/offers/active with `cache: "no-store"`, refetches when the tab
// regains focus, and returns a sensible empty default so callers never see
// undefined. The offers table stays the single source of truth — read live.
//
// A module-level cache + subscriber set means the many product cards that
// each call this hook share ONE in-flight request rather than fetching the
// endpoint per card.
// ============================================================

import { useEffect, useState } from "react";
import type { Offer } from "@/lib/offers";

export type ActiveOffers = { primary: Offer | null; stackable: Offer[] };

const EMPTY: ActiveOffers = { primary: null, stackable: [] };

let cache: ActiveOffers = EMPTY;
let loaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function fetchActive(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/offers/active", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as ActiveOffers;
        cache = {
          primary: data.primary ?? null,
          stackable: Array.isArray(data.stackable) ? data.stackable : [],
        };
        loaded = true;
        notify();
      }
    } catch {
      /* keep whatever we last had */
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useActiveOffer(): { offers: ActiveOffers; loading: boolean } {
  const [offers, setOffers] = useState<ActiveOffers>(cache);
  const [loading, setLoading] = useState(!loaded);

  useEffect(() => {
    const update = () => {
      setOffers(cache);
      setLoading(false);
    };
    listeners.add(update);
    fetchActive().then(update);

    // Refresh when the user returns to this tab (admin edits show up live).
    const onFocus = () => {
      fetchActive().then(update);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      listeners.delete(update);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return { offers, loading };
}
