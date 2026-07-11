// ============================================================
// Le Rasa Bakery — public policy readers (SERVER ONLY)
//
// Reads the `policies` table with `cache: "no-store"` so an admin edit shows
// up on the very next request. Server components import this directly; client
// components (the footer) go through /api/policies. Same discipline and anon
// RLS scope as lib/site-settings-server.ts.
//
// Reads with the ANON key, so RLS ("Public read enabled policies", see
// supabase/sql/19_policies.sql) is what actually hides disabled drafts. The
// enabled=eq.true filters below are belt-and-braces, not the guarantee.
// ============================================================

import "server-only";
import { POLICY_SUMMARY_COLS, type Policy, type PolicySummary } from "@/lib/policies";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// The anon key is now the "publishable" key; fall back to the legacy name.
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const POLICY_FULL_COLS =
  "id,title,short_description,content,read_more_text,slug,display_order,enabled";

/**
 * Every enabled policy, in the admin's chosen order. Returns [] on any failure
 * so a policies outage can never take down the page that lists them.
 */
export async function getPolicies(): Promise<PolicySummary[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/policies` +
        `?select=${POLICY_SUMMARY_COLS}` +
        `&enabled=eq.true` +
        `&order=display_order.asc,created_at.asc`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as PolicySummary[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/**
 * One enabled policy by slug.
 *
 * The three outcomes are deliberately distinct, because the caller must treat
 * them differently:
 *
 *   Policy    — found and published.
 *   null      — genuinely not there (no such slug, or it's a disabled draft).
 *               The page turns this into a 404.
 *   undefined — we could not reach the database, so we DON'T KNOW. The page
 *               must NOT call notFound() here: telling Google a live policy is
 *               permanently gone because of a transient blip is far worse than
 *               showing an error.
 */
export async function getPolicy(slug: string): Promise<Policy | null | undefined> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return undefined;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/policies` +
        `?select=${POLICY_FULL_COLS}` +
        `&slug=eq.${encodeURIComponent(slug)}` +
        `&enabled=eq.true` +
        `&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return undefined;
    const rows = (await res.json()) as Policy[];
    return (Array.isArray(rows) ? rows[0] : undefined) ?? null;
  } catch {
    return undefined;
  }
}
