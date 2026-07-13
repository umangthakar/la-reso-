// ============================================================
// GET /api/customization — public, unauthenticated storefront read.
//
// Returns the whole accessories config as data:
//
//   categories  every active accessory category (with its accessories, prices,
//               images, display type, limits and dependencies), in admin sort
//               order
//   productIds  the products the customization page opens for — i.e. the cakes
//
// `productIds` is what lets a product card decide whether "Buy Now" goes
// straight to the cart or through the customization page, WITHOUT every
// product fetch in the app having to grow an extra column.
//
// Same discipline as /api/offers/active and /api/site-settings: force-dynamic,
// no-store, and any failure returns the safe empty fallback (no groups, no
// cake ids → every product simply keeps today's flow) rather than throwing at
// the storefront.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import {
  fetchAccessoryCategories,
  type AccessoryCategory,
} from "@/lib/customization";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type CustomizationConfig = {
  categories: AccessoryCategory[];
  productIds: string[];
};

const EMPTY: CustomizationConfig = { categories: [], productIds: [] };

export async function GET() {
  try {
    // The anon client is enough: RLS already exposes only active categories
    // and accessories, and `is_customizable` is public catalogue data.
    const supabase = (await createClient()) as unknown as SupabaseClient;

    const [categories, products] = await Promise.all([
      fetchAccessoryCategories(supabase),
      supabase.from("products").select("id").eq("is_customizable", true),
    ]);

    const productIds = ((products.data ?? []) as { id: string }[]).map((p) => p.id);

    return NextResponse.json({ categories, productIds } satisfies CustomizationConfig, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // Not migrated yet (no tables / no column) → the storefront behaves exactly
    // as it did before this feature existed.
    return NextResponse.json(EMPTY, { headers: { "Cache-Control": "no-store" } });
  }
}
