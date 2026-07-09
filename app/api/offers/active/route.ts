// ============================================================
// GET /api/offers/active — public, unauthenticated storefront read.
//
// Returns three things for RIGHT NOW:
//
//   primary / stackable  the offers that drive PRICING (product cards, cart,
//                        checkout preview). Read with the anon key, so coupons
//                        are excluded by RLS AND by the type filter — a coupon
//                        must never auto-discount anything.
//
//   display              the ONE offer that drives the STOREFRONT: banner copy,
//                        right-side hero text/image, background image, CTA and
//                        the home-page popup. Computed by lib/offers.ts from a
//                        WIDER pool that also contains coupon offers, because a
//                        coupon should be able to advertise itself ("SAVE20 —
//                        use code SAVE20 at checkout") without discounting.
//
// Coupon rows are hidden from anon by RLS (supabase/sql/15_offers.sql), so the
// display pool reads them with the service role, selecting ONLY presentation
// columns — coupon_code is never in the projection and never leaves the server.
// A coupon appears on the storefront only once an admin gives it banner/popup
// copy (see isDisplayEligible), which is the explicit opt-in.
//
// Same discipline as /api/categories and /api/site-settings: force-dynamic,
// no-store, and any failure returns the safe empty fallback rather than
// throwing at the storefront.
// ============================================================

import { NextResponse } from "next/server";
import {
  offerFromRow,
  resolveActiveOffers,
  resolveActiveDisplay,
  type Offer,
  type OfferDisplay,
} from "@/lib/offers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// offer_emails is NOT anon-readable, so it is deliberately not embedded here.
const SELECT =
  "*,offer_category_rules(category,mode),offer_product_rules(product_id,mode)";

// Presentation columns only, for the service-role coupon read. `coupon_code`,
// the discount values and the usage limits are all deliberately absent: this
// projection is the security boundary that keeps codes non-enumerable, so do
// NOT replace it with `*`. Schedule columns are included because the display
// offer's active-ness is derived, never stored.
const DISPLAY_SELECT = [
  "id",
  "name",
  "type",
  "enabled",
  "stackable",
  "priority",
  "created_at",
  "start_at",
  "end_at",
  "time_start",
  "time_end",
  "days_of_week",
  "announcement_text",
  "hero_heading",
  "hero_subtext",
  "hero_highlight_text",
  "hero_display_mode",
  "hero_image_url",
  "cta_text",
  "cta_link",
  "banner_image_url",
  "popup_title",
  "popup_description",
  "popup_image_url",
  "popup_cta_text",
  "popup_cta_link",
].join(",");

type ActiveResponse = {
  primary: Offer | null;
  stackable: Offer[];
  display: OfferDisplay | null;
};

const EMPTY: ActiveResponse = { primary: null, stackable: [], display: null };

/**
 * Enabled coupon offers, presentation columns only, via the service role.
 * Returns [] when the key is absent (coupons simply never reach the banner) or
 * when the projection fails — e.g. 18_offer_banner_popup.sql hasn't been run
 * yet, in which case PostgREST 400s on the unknown popup_* columns. Either way
 * the rest of the storefront keeps working.
 */
async function fetchCouponDisplayOffers(): Promise<Offer[]> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !serviceKey) return [];

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/offers?select=${DISPLAY_SELECT}&type=eq.coupon&enabled=eq.true`,
      {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        cache: "no-store",
      },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Record<string, unknown>[];
    return Array.isArray(rows) ? rows.map(offerFromRow) : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const noStore = { "Cache-Control": "no-store, max-age=0" };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json(EMPTY, { headers: noStore });
  }

  try {
    const [res, couponOffers] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/offers?select=${SELECT}&type=neq.coupon&enabled=eq.true`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          cache: "no-store",
        },
      ),
      fetchCouponDisplayOffers(),
    ]);
    if (!res.ok) return NextResponse.json(EMPTY, { headers: noStore });

    const rows = (await res.json()) as Record<string, unknown>[];
    const offers = Array.isArray(rows) ? rows.map(offerFromRow) : [];

    const now = new Date();
    // Pricing sees non-coupon offers only — exactly as before this endpoint
    // learned about `display`.
    const resolved = resolveActiveOffers(offers, now);
    // Display sees both, and picks the single winning offer.
    const display = resolveActiveDisplay([...offers, ...couponOffers], now);

    return NextResponse.json({ ...resolved, display } satisfies ActiveResponse, {
      headers: noStore,
    });
  } catch {
    return NextResponse.json(EMPTY, { headers: noStore });
  }
}
