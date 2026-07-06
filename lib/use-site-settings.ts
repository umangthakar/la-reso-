"use client";

// ============================================================
// useSiteSettings — client hook for public storefront settings.
//
// Fetches /api/site-settings with `cache: "no-store"` so admin edits
// reflect immediately, and re-fetches when the tab regains focus (so
// editing in one tab and switching back to the storefront updates it).
// Returns DEFAULT_SETTINGS until loaded, so callers never see nulls.
// ============================================================

import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type PublicSettings } from "@/lib/site-settings";

export function useSiteSettings(): { settings: PublicSettings; loading: boolean } {
  const [settings, setSettings] = useState<PublicSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/site-settings", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { settings?: PublicSettings };
        if (!cancelled && data.settings) setSettings(data.settings);
      } catch {
        /* keep defaults on failure */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    // Refresh when the user returns to this tab.
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return { settings, loading };
}
