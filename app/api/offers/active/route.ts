// ============================================================
// GET /api/offers/active — public, unauthenticated storefront read.
//
// Returns the resolved { primary, stackable } offer set for RIGHT NOW,
// computed by lib/offers.ts from the anon-readable, non-coupon offers.
// Same shape/discipline as /api/categories and /api/site-settings:
// force-dynamic, no-store, and any failure returns the safe empty fallback
// instead of throwing at the storefront. Coupon offers are never listed here
// (they're code-gated via /api/offers/validate-coupon).
// ============================================================

import { NextResponse } from "next/server";
import { offerFromRow, resolveActiveOffers, type Offer } from "@/lib/offers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// offer_emails is NOT anon-readable, so it is deliberately not embedded here.
const SELECT =
  "*,offer_category_rules(category,mode),offer_product_rules(product_id,mode)";

const EMPTY = { primary: null as Offer | null, stackable: [] as Offer[] };

export async function GET() {
  const noStore = { "Cache-Control": "no-store, max-age=0" };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json(EMPTY, { headers: noStore });
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/offers?select=${SELECT}&type=neq.coupon&enabled=eq.true`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return NextResponse.json(EMPTY, { headers: noStore });

    const rows = (await res.json()) as Record<string, unknown>[];
    const offers = Array.isArray(rows) ? rows.map(offerFromRow) : [];
    const resolved = resolveActiveOffers(offers, new Date());

    return NextResponse.json(resolved, { headers: noStore });
  } catch {
    return NextResponse.json(EMPTY, { headers: noStore });
  }
}
