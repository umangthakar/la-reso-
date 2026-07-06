// ============================================================
// GET /api/categories — public category list for the storefront menu tabs.
//
// Always fresh (no-store) so admin add / rename / delete reflects on the
// menu immediately. Returns EXACTLY the admin-curated list stored in
// site_settings.categories (a jsonb string[]). Falls back to the default
// six only if that column is missing/unreadable (e.g. SQL not yet run), so
// the menu never renders with no tabs.
// ============================================================

import { NextResponse } from "next/server";

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

export async function GET() {
  const noStore = { "Cache-Control": "no-store, max-age=0" };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ categories: DEFAULT_CATEGORIES }, { headers: noStore });
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/site_settings?select=categories&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: "no-store",
      },
    );
    // Column missing / request failed → safe fallback so tabs still show.
    if (!res.ok) {
      return NextResponse.json({ categories: DEFAULT_CATEGORIES }, { headers: noStore });
    }
    const rows = (await res.json()) as { categories: unknown }[];
    const raw = rows?.[0]?.categories;
    const list = Array.isArray(raw)
      ? raw.filter((c): c is string => typeof c === "string" && c.trim() !== "")
      : null;

    // Null/absent value → fall back; a legitimately empty array is honoured.
    return NextResponse.json(
      { categories: list ?? DEFAULT_CATEGORIES },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json({ categories: DEFAULT_CATEGORIES }, { headers: noStore });
  }
}
