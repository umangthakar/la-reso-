// ============================================================
// GET /api/policies/[slug] — public, unauthenticated read of ONE policy.
//
// Returns the full document (content included) for the enabled policy at that
// exact slug. The slug is a real stored column, so this is a direct equality
// hit on the UNIQUE index — no re-slugifying of titles to find a match, and so
// renaming a policy's title can never break a bookmarked URL.
//
// A DISABLED policy is a draft, and a draft must not be readable by URL just
// because someone guessed it. Two independent things enforce that: RLS
// ("Public read enabled policies", supabase/sql/19_policies.sql) hides the row
// from the anon key entirely, and the enabled=eq.true filter below asks only
// for published ones. Either alone would do it; a missing policy and a disabled
// one are answered identically (404), so the response cannot be used to probe
// for the existence of unpublished drafts.
// ============================================================

import { NextResponse } from "next/server";
import { isValidPolicySlug, type Policy } from "@/lib/policies";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const POLICY_COLS =
  "id,title,short_description,content,read_more_text,slug,display_order,enabled";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const noStore = { "Cache-Control": "no-store, max-age=0" };
  const notFound = () =>
    NextResponse.json({ error: "Policy not found" }, { status: 404, headers: noStore });

  // A slug the DB's CHECK constraint would never have allowed cannot match a
  // row, so don't spend a round-trip proving it.
  const slug = (params.slug ?? "").toLowerCase();
  if (!isValidPolicySlug(slug)) return notFound();

  // No env -> we cannot say whether this policy exists. That is an outage, not
  // a 404: answering "not found" would invite the caller (and any crawler) to
  // treat a live page as permanently gone.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { error: "Policies are temporarily unavailable" },
      { status: 503, headers: noStore },
    );
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/policies` +
        `?select=${POLICY_COLS}` +
        `&slug=eq.${encodeURIComponent(slug)}` +
        `&enabled=eq.true` +
        `&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: "no-store",
      },
    );
    // Same reasoning as the missing-env case above: a failed request means we
    // don't know, and "don't know" is not "doesn't exist".
    if (!res.ok) {
      return NextResponse.json(
        { error: "Policies are temporarily unavailable" },
        { status: 503, headers: noStore },
      );
    }

    const rows = (await res.json()) as Policy[];
    const policy = Array.isArray(rows) ? rows[0] : undefined;
    if (!policy) return notFound();

    return NextResponse.json({ policy }, { headers: noStore });
  } catch {
    return NextResponse.json(
      { error: "Policies are temporarily unavailable" },
      { status: 503, headers: noStore },
    );
  }
}
