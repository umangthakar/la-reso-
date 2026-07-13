// ============================================================
// GET /api/customization — public, unauthenticated storefront read.
//
// Returns the whole Cake Customization Wizard as data:
//
//   groups     every active accessory group (with its options, prices,
//              display type, limits and dependencies), in admin sort order
//   productIds the products the wizard opens for — i.e. the cakes
//
// `productIds` is what lets a product card decide whether "Buy Now" goes
// straight to the cart or through the wizard, WITHOUT every product fetch in
// the app having to grow an extra column.
//
// Same discipline as /api/offers/active and /api/site-settings: force-dynamic,
// no-store, and any failure returns the safe empty fallback (no groups, no
// cake ids → every product simply keeps today's flow) rather than throwing at
// the storefront.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { fetchAccessoryGroups, type AccessoryGroup } from "@/lib/customization";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type CustomizationConfig = {
  groups: AccessoryGroup[];
  productIds: string[];
};

const EMPTY: CustomizationConfig = { groups: [], productIds: [] };

export async function GET() {
  try {
    // The anon client is enough: RLS already exposes only active groups and
    // options, and `is_customizable` is public catalogue data.
    const supabase = (await createClient()) as unknown as SupabaseClient;

    const [groups, products] = await Promise.all([
      fetchAccessoryGroups(supabase),
      supabase.from("products").select("id").eq("is_customizable", true),
    ]);

    const productIds = ((products.data ?? []) as { id: string }[]).map((p) => p.id);

    return NextResponse.json({ groups, productIds } satisfies CustomizationConfig, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // Not migrated yet (no tables / no column) → the storefront behaves exactly
    // as it did before this feature existed.
    return NextResponse.json(EMPTY, { headers: { "Cache-Control": "no-store" } });
  }
}
