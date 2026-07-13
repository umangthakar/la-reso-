"use client";

// ============================================================
// useCustomization — client hook for the live Cake Customization config.
//
// Same shape/discipline as lib/use-active-offer.ts: fetches /api/customization
// with `cache: "no-store"`, refetches on tab focus (so an admin's accessory
// edits show up live), and returns an empty default so callers never see
// undefined — with no config, `isCustomizable` is false everywhere and every
// product keeps today's flow.
//
// A module-level cache + subscriber set means the many product cards that each
// call this hook share ONE in-flight request rather than fetching per card.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import type { AccessoryGroup } from "@/lib/customization";

export type CustomizationConfig = {
  groups: AccessoryGroup[];
  productIds: string[];
};

const EMPTY: CustomizationConfig = { groups: [], productIds: [] };

let cache: CustomizationConfig = EMPTY;
let loaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function fetchConfig(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/customization", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as CustomizationConfig;
        cache = {
          groups: Array.isArray(data.groups) ? data.groups : [],
          productIds: Array.isArray(data.productIds) ? data.productIds : [],
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

export function useCustomization(): {
  config: CustomizationConfig;
  loading: boolean;
  /** True when this product should open the wizard before the cart. */
  isCustomizable: (productId: string) => boolean;
} {
  const [config, setConfig] = useState<CustomizationConfig>(cache);
  const [loading, setLoading] = useState(!loaded);

  useEffect(() => {
    const update = () => {
      setConfig(cache);
      setLoading(false);
    };
    listeners.add(update);
    fetchConfig().then(update);

    const onFocus = () => {
      fetchConfig().then(update);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      listeners.delete(update);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const isCustomizable = useCallback(
    (productId: string) =>
      config.groups.length > 0 && config.productIds.includes(productId),
    [config],
  );

  return { config, loading, isCustomizable };
}
