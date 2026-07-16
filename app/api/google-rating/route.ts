// ============================================================
// GET /api/google-rating — the live Google Business rating, always fresh.
//
// The single source of truth for every rating shown on the storefront. Client
// components (navbar) read it through lib/use-google-rating; server components
// (about) can call getGoogleReviews() directly instead.
//
// Returns only the headline numbers, never the API key. `rating: 0` means "no
// live rating available" (feature off, or never synced) — callers must hide
// their rating UI rather than substitute a hardcoded number.
//
// This is a read: getGoogleReviews() serves the cached value and only refreshes
// when that cache is older than the admin-configured window.
// ============================================================

import { NextResponse } from "next/server";
import { getGoogleReviews } from "@/lib/google-reviews";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const google = await getGoogleReviews();
  return NextResponse.json(
    { rating: google?.rating ?? 0, total: google?.total ?? 0 },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
