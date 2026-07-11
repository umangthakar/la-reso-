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
import {
  POLICY_SUMMARY_COLS,
  POLICY_SUMMARY_COLS_PRE_ICONS,
  type Policy,
  type PolicySummary,
} from "@/lib/policies";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// The anon key is now the "publishable" key; fall back to the legacy name.
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// `icon_url` is deliberately NOT selected here: only the home-page cards draw an
// icon, and the full policy page has nowhere to put one. Not asking for it also
// means this reader keeps working on a database that has not run
// supabase/sql/20_policy_icons.sql yet — PostgREST 400s a select naming a column
// that doesn't exist, which would turn every live policy page into an error.
const POLICY_FULL_COLS =
  "id,title,short_description,content,read_more_text,slug,display_order,enabled";

function listUrl(cols: string): string {
  return (
    `${SUPABASE_URL}/rest/v1/policies` +
    `?select=${cols}` +
    `&enabled=eq.true` +
    `&order=display_order.asc,created_at.asc`
  );
}

/**
 * Every enabled policy, in the admin's chosen order. Returns [] on any failure
 * so a policies outage can never take down the page that lists them.
 *
 * The second request is the pre-20_policy_icons.sql fallback (see
 * POLICY_SUMMARY_COLS_PRE_ICONS): on a database without the `icon_url` column
 * the first select 400s, and without this the footer would lose its policy
 * links on every page until the migration is run.
 */
export async function getPolicies(): Promise<PolicySummary[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];

  const headers = {
    apikey: SUPABASE_ANON_KEY as string,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };

  try {
    let res = await fetch(listUrl(POLICY_SUMMARY_COLS), { headers, cache: "no-store" });
    if (!res.ok) {
      res = await fetch(listUrl(POLICY_SUMMARY_COLS_PRE_ICONS), {
        headers,
        cache: "no-store",
      });
      if (!res.ok) return [];
    }
    const rows = (await res.json()) as PolicySummary[];
    if (!Array.isArray(rows)) return [];
    // icon_url is absent on the fallback path; normalise so callers never
    // have to care which query answered.
    return rows.map((r) => ({ ...r, icon_url: r.icon_url ?? "" }));
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
    const row = (Array.isArray(rows) ? rows[0] : undefined) ?? null;
    // icon_url isn't in the select above; keep the returned object honest to the
    // Policy type rather than handing callers an undefined typed as a string.
    return row ? { ...row, icon_url: row.icon_url ?? "" } : null;
  } catch {
    return undefined;
  }
}
