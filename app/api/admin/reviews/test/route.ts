// ============================================================
// Admin API — Google Reviews "Test Connection"
// Service-role, password-gated. Verifies the API key + Place ID against the
// Google Places API and reports success/failure WITHOUT writing the cache.
//
// A freshly typed (unsaved) key/place id may be passed in the body to test
// before saving; otherwise the stored config is used.
// ============================================================

import { NextResponse } from "next/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { testConnection } from "@/lib/google-reviews";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const result = await testConnection({
      api_key: typeof body.api_key === "string" ? body.api_key : undefined,
      place_id: typeof body.place_id === "string" ? body.place_id : undefined,
    });
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Test failed" },
      { status: 500 },
    );
  }
}
