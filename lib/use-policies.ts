"use client";

// ============================================================
// usePolicies — client hook for the storefront footer.
//
// Fetches /api/policies with `cache: "no-store"` so admin edits (a new
// policy, a rename, a reorder, a disable) reflect immediately, and re-fetches
// when the tab regains focus. Returns [] until loaded, so the footer simply
// renders no policy links rather than a placeholder that then shifts.
//
// Same shape as useSiteSettings(). There is deliberately no fallback list:
// the policies table is the ONLY source of these links.
// ============================================================

import { useEffect, useState } from "react";
import type { PolicySummary } from "@/lib/policies";

export function usePolicies(): { policies: PolicySummary[]; loading: boolean } {
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/policies", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { policies?: PolicySummary[] };
        if (!cancelled && Array.isArray(data.policies)) setPolicies(data.policies);
      } catch {
        /* keep whatever we have on failure */
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

  return { policies, loading };
}
