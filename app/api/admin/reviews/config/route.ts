// ============================================================
// Admin API — Google Reviews configuration (GET masked + PUT save)
// Service-role, password-gated. Stored on the site_settings row under
// `google_reviews_config`. The Google Places API key is encrypted at rest
// (lib/crypto) and NEVER returned to the browser — GET only reports whether
// one is set, plus its last 4, and the latest sync status.
//
// Requires the columns from supabase/sql/24_google_reviews.sql.
// ============================================================

import { NextResponse } from "next/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import {
  getAdminReviewsState,
  saveAdminReviewsConfig,
  CACHE_HOUR_OPTIONS,
} from "@/lib/google-reviews";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const state = await getAdminReviewsState();
    return NextResponse.json({ config: state });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load Google Reviews settings" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const cache_hours = Number(body.cache_hours);
    await saveAdminReviewsConfig({
      enabled: Boolean(body.enabled),
      place_id: String(body.place_id ?? "").trim(),
      cache_hours: (CACHE_HOUR_OPTIONS as readonly number[]).includes(cache_hours)
        ? cache_hours
        : 6,
      api_key: String(body.api_key ?? ""), // blank = keep existing
    });
    const state = await getAdminReviewsState();
    return NextResponse.json({ config: state });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save Google Reviews settings" },
      { status: 500 },
    );
  }
}
