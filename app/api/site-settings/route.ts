// ============================================================
// GET /api/site-settings — public storefront settings, always fresh.
//
// Client components (navbar, footer, menu hero, checkout) fetch this
// with `cache: "no-store"` so admin edits reflect immediately. Only
// public fields are returned (see lib/site-settings PublicSettings).
// ============================================================

import { NextResponse } from "next/server";
import { getPublicSettings } from "@/lib/site-settings-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const settings = await getPublicSettings();
  return NextResponse.json(
    { settings },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
