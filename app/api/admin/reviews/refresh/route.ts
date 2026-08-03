// ============================================================
// Admin API — Google Reviews "Refresh Reviews"
// Service-role, password-gated. Immediately fetches the latest reviews from
// Google, updates the DB cache, and returns the new status — no server
// restart needed. The storefront picks up the refreshed cache on its next
// (no-store) render.
// ============================================================

import { NextResponse } from "next/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { syncGoogleReviews, getAdminReviewsState } from "@/lib/google-reviews";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const result = await syncGoogleReviews();
    const state = await getAdminReviewsState();
    const ok = result.status === "connected";
    return NextResponse.json({ ok, result, config: state });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Refresh failed" },
      { status: 500 },
    );
  }
}
