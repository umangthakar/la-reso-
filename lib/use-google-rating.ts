"use client";

// ============================================================
// useGoogleRating — client hook for the live Google Business rating.
//
// Mirrors useSiteSettings: fetches with `cache: "no-store"` so an admin sync
// reflects immediately, and re-fetches when the tab regains focus.
//
// `rating` is 0 until loaded, and stays 0 when there is no live rating (the
// integration is off, or has never synced). Callers must hide their rating UI
// in that case — never fall back to a hardcoded number, or the site drifts out
// of step with Google again.
// ============================================================

import { useEffect, useState } from "react";

export type GoogleRating = { rating: number; total: number };

export function useGoogleRating(): GoogleRating {
  const [data, setData] = useState<GoogleRating>({ rating: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/google-rating", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as Partial<GoogleRating>;
        if (cancelled) return;
        setData({ rating: Number(json.rating) || 0, total: Number(json.total) || 0 });
      } catch {
        /* leave at 0 → the rating UI stays hidden rather than showing a guess */
      }
    }

    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return data;
}
