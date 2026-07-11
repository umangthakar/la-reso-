// ============================================================
// GET /api/policies — public, unauthenticated storefront read.
//
// The enabled policies, in the admin's drag order. Powers the footer links and
// the policy index, so it runs on effectively every page.
//
// Returns SUMMARY fields only (id, title, short_description, read_more_text,
// slug) — never `content`. The Markdown body of every policy on every page load
// would be pure waste; the full document is fetched per-slug by the route next
// door, only when someone actually opens one.
//
// Same discipline as /api/categories: force-dynamic, no-store (so an admin edit
// shows up immediately), and ANY failure returns the safe empty fallback rather
// than throwing at the storefront — a broken policies table must not take the
// site's footer down with it.
//
// Reads with the ANON key, so RLS ("Public read enabled policies", see
// supabase/sql/19_policies.sql) is what actually hides disabled rows. The
// enabled=eq.true filter below is belt-and-braces, not the guarantee.
// ============================================================

import { NextResponse } from "next/server";
import { POLICY_SUMMARY_COLS, type PolicySummary } from "@/lib/policies";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const EMPTY: { policies: PolicySummary[] } = { policies: [] };

export async function GET() {
  const noStore = { "Cache-Control": "no-store, max-age=0" };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json(EMPTY, { headers: noStore });
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/policies` +
        `?select=${POLICY_SUMMARY_COLS}` +
        `&enabled=eq.true` +
        `&order=display_order.asc,created_at.asc`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: "no-store",
      },
    );
    // Table missing (migration not run) / request failed -> no footer links,
    // rather than a 500 on every page of the site.
    if (!res.ok) return NextResponse.json(EMPTY, { headers: noStore });

    const rows = (await res.json()) as PolicySummary[];
    return NextResponse.json(
      { policies: Array.isArray(rows) ? rows : [] },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(EMPTY, { headers: noStore });
  }
}
