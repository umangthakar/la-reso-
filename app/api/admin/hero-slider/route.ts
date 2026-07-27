// ============================================================
// Admin API — hero slider images: list (GET).
// Service-role, password-gated. Schema: supabase/sql/36_hero_slider.sql.
//
// CREATION LIVES AT ./upload, NOT HERE. Phase 2 sketched a POST on this route
// taking { image_url }, and implementing it that way would have been a
// mistake: an upload endpoint followed by a create endpoint gives the browser
// two chances to stop halfway and strand a file in the bucket with no row
// pointing at it. ./upload therefore writes the file AND inserts the row in one
// request, and deletes the file if the insert fails. A row-only POST here would
// be a second way in that skips that guarantee, so it does not exist.
//
// Like /api/admin/policies (and unlike /api/admin/products) this list is NOT
// paginated: a hero carries a handful of images, and the admin page
// drag-reorders the whole list, which only makes sense with every row on
// screen at once.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { HERO_SLIDER_ADMIN_SELECT, normaliseHeroSliderImage } from "@/lib/hero-slider";

export const dynamic = "force-dynamic";

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

// ------------------------------------------------------------
// GET — every image, visible or not, in the admin's display order.
// ------------------------------------------------------------
// The admin must see hidden images (they are the ones they need to re-show),
// so this deliberately does NOT filter on `visible` the way a storefront read
// would. RLS is bypassed here anyway — this client holds the service role —
// which is exactly why the filter is a decision made per route rather than
// inherited.
export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  // Wrap the whole DB interaction so a client-level throw (e.g. the Supabase
  // host being unreachable) returns a clean JSON 500, not a raw stack trace.
  try {
    const supabase = adminDb();

    // display_order is the admin's drag order. created_at breaks ties, so rows
    // sharing an order (all 0 before the first drag) still list
    // deterministically instead of shuffling between loads.
    // The linked product comes back embedded, so the list can show which cake
    // each image advertises without a second request per row. Unlike the
    // storefront read this one runs as the service role, so a product that is
    // hidden from the shop still resolves — the admin needs to see that the
    // link exists AND that it is pointing at something customers can't reach.
    const { data, error } = await supabase
      .from("hero_slider_images")
      .select(HERO_SLIDER_ADMIN_SELECT)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ images: (data ?? []).map(normaliseHeroSliderImage) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load hero slider images" },
      { status: 500 },
    );
  }
}
