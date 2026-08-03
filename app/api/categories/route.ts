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
import { PUBLIC_SETTINGS_VIEW } from "@/lib/site-settings";

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

/**
 * One settings read for a given select, or null if the request failed.
 *
 * Reads the PUBLIC PROJECTION first: site_settings is no longer anon-readable
 * because it holds the encrypted Stripe secret key (audit finding C4). Both
 * `categories` and `category_parents` are carried by the view.
 *
 * The base table is retried second only so this code is safe to deploy either
 * side of supabase/sql/43_critical_security_fixes.sql — before it the view does
 * not exist, after it the table read is refused. Either way the menu keeps its
 * tabs instead of falling back to the hard-coded six.
 */
async function readSettings(
  select: string,
): Promise<{ categories?: unknown; category_parents?: unknown } | null> {
  for (const resource of [PUBLIC_SETTINGS_VIEW, "site_settings"]) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${resource}?select=${select}&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) continue;
    const rows = (await res.json()) as Record<string, unknown>[];
    return rows?.[0] ?? {};
  }
  return null;
}

/**
 * The set of category names that currently have at least one VISIBLE, in-stock
 * product. Returns null when the lookup fails, which the caller treats as
 * "don't filter" — a storefront with every tab is better than one with none.
 *
 * Reads with the anon key, so RLS ("Public read visible products") already
 * limits this to what a shopper can actually see.
 */
async function fetchPopulatedCategories(): Promise<Set<string> | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?select=category&visible=eq.true`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { category: string | null }[];
    if (!Array.isArray(rows)) return null;
    const set = new Set<string>();
    for (const r of rows) {
      const c = (r?.category ?? "").trim();
      if (c) set.add(c);
    }
    return set;
  } catch {
    return null;
  }
}

/**
 * True when `name` has products of its own, or any descendant does.
 * Depth-guarded so a malformed parent map can't loop (sanitiseParents already
 * rejects cycles; this is belt and braces).
 */
function hasStock(
  name: string,
  all: string[],
  parents: ParentMap,
  populated: Set<string>,
): boolean {
  if (populated.has(name)) return true;
  const children = all.filter((c) => parents[c] === name);
  let depth = 0;
  let frontier = children;
  while (frontier.length > 0 && depth < 5) {
    if (frontier.some((c) => populated.has(c))) return true;
    frontier = all.filter((c) => frontier.includes(parents[c] ?? ""));
    depth += 1;
  }
  return false;
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
    const curated = list ?? DEFAULT_CATEGORIES;
    // Sanitised with the shared rules, so a hand-edited map can never point at
    // a category that isn't in the list or describe a cycle.
    const parents = hasParents
      ? sanitiseParents(curated, row.category_parents)
      : ({} as ParentMap);

    // ---- Drop categories with nothing to show -------------------------------
    // "Cookies" and "Mini Treats" were live tabs leading to "No products in
    // this category yet" — a dead end on the main shopping surface. They stay in
    // site_settings.categories (the admin still manages them, and adding a
    // product brings the tab straight back); they are simply not offered to
    // shoppers while empty.
    //
    // A PARENT counts as non-empty when it, or any of its descendants, has a
    // visible product — otherwise selecting "Cakes" could hide the 39 Custom
    // Cakes nested under it.
    const populated = await fetchPopulatedCategories();
    const categories =
      populated === null
        ? curated // couldn't check → show everything, as before
        : curated.filter((name) => hasStock(name, curated, parents, populated));

    // Keep the parent map consistent with the filtered list.
    const visible = new Set(categories);
    const filteredParents: ParentMap = {};
    for (const [child, parent] of Object.entries(parents)) {
      if (visible.has(child) && parent && visible.has(parent)) filteredParents[child] = parent;
    }

    return NextResponse.json(
      { categories, parents: filteredParents },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(fallback, { headers: noStore });
  }
}
