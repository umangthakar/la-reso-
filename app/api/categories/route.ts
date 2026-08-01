// ============================================================
// GET /api/categories — public category list for the storefront menu tabs.
//
// Always fresh (no-store) so admin add / rename / delete reflects on the
// menu immediately. Returns EXACTLY the admin-curated list stored in
// site_settings.categories (a jsonb string[]). Falls back to the default
// six only if that column is missing/unreadable (e.g. SQL not yet run), so
// the menu never renders with no tabs.
//
// `parents` is an ADDITION: the child → parent map from
// site_settings.category_parents (see supabase/sql/40_category_hierarchy.sql),
// so the menu can show top-level categories first and reveal a parent's
// children on selection. `categories` itself is UNCHANGED — still the same
// flat, ordered string[] every existing caller reads, subcategories included.
// A database without the hierarchy column simply reports `parents: {}`, which
// renders exactly the flat list the menu showed before.
// ============================================================

import { NextResponse } from "next/server";
import { sanitiseParents, type ParentMap } from "@/lib/category-hierarchy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Matches the seeded default in supabase/sql/00_full_setup.sql.
const DEFAULT_CATEGORIES = [
  "Birthday Cakes",
  "Cupcakes",
  "Custom Cakes",
  "Brownies",
  "Cookies",
  "Gift Boxes",
];

/** One settings read for a given select, or null if the request failed. */
async function readSettings(
  select: string,
): Promise<{ categories?: unknown; category_parents?: unknown } | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/site_settings?select=${select}&limit=1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY as string,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows?.[0] ?? {};
}

export async function GET() {
  const noStore = { "Cache-Control": "no-store, max-age=0" };
  const fallback = { categories: DEFAULT_CATEGORIES, parents: {} as ParentMap };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json(fallback, { headers: noStore });
  }

  try {
    // Ask for the hierarchy column, then retry without it. A database that
    // hasn't run 40_category_hierarchy.sql would 400 on the wider select, and
    // that must NOT cost the menu its tabs — it just means no hierarchy.
    let hasParents = true;
    let row = await readSettings("categories,category_parents");
    if (!row) {
      hasParents = false;
      row = await readSettings("categories");
    }
    // Column missing / request failed → safe fallback so tabs still show.
    if (!row) {
      return NextResponse.json(fallback, { headers: noStore });
    }

    const raw = row.categories;
    const list = Array.isArray(raw)
      ? raw.filter((c): c is string => typeof c === "string" && c.trim() !== "")
      : null;

    // Null/absent value → fall back; a legitimately empty array is honoured.
    const categories = list ?? DEFAULT_CATEGORIES;
    // Sanitised with the shared rules, so a hand-edited map can never point at
    // a category that isn't in the list or describe a cycle.
    const parents = hasParents
      ? sanitiseParents(categories, row.category_parents)
      : ({} as ParentMap);

    return NextResponse.json({ categories, parents }, { headers: noStore });
  } catch {
    return NextResponse.json(fallback, { headers: noStore });
  }
}
