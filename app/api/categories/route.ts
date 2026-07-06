// ============================================================
// GET /api/categories — public category list for the storefront menu tabs.
//
// Always fresh (no-store) so admin add / rename / delete reflects on the
// menu immediately. Returns the UNION of:
//   • site_settings.categories  the admin-curated ordered list (incl. empty)
//   • distinct products.category values (so existing products always show)
// Persisted order first, then any product-only categories alphabetically.
// ============================================================

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function headers() {
  return {
    apikey: SUPABASE_ANON_KEY as string,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

async function fetchProductCategories(): Promise<string[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?select=category&in_stock=eq.true`,
      { headers: headers(), cache: "no-store" },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as { category: string | null }[];
    return rows.map((r) => r.category).filter((c): c is string => !!c && c.trim() !== "");
  } catch {
    return [];
  }
}

async function fetchPersistedCategories(): Promise<string[]> {
  // Isolated in its own try/catch: if the `categories` column hasn't been
  // added yet (SQL 09 not run), this 400s and we simply fall back to the
  // product-derived list without breaking the menu.
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/site_settings?select=categories&limit=1`,
      { headers: headers(), cache: "no-store" },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as { categories: unknown }[];
    const list = rows?.[0]?.categories;
    return Array.isArray(list)
      ? list.filter((c): c is string => typeof c === "string" && c.trim() !== "")
      : [];
  } catch {
    return [];
  }
}

export async function GET() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ categories: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const [persisted, productCats] = await Promise.all([
    fetchPersistedCategories(),
    fetchProductCategories(),
  ]);

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const name of persisted) {
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    ordered.push(name);
  }
  for (const name of Array.from(new Set(productCats)).sort((a, b) => a.localeCompare(b))) {
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    ordered.push(name);
  }

  return NextResponse.json(
    { categories: ordered },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
