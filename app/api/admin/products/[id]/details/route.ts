// ============================================================
// Admin API — product extras for the edit form (GET).
// Returns the product's ingredients, gallery images and size
// variants. Each part degrades to an empty list when the
// 26_product_variants.sql migration hasn't been run, so the admin
// form still opens for old products. Service-role, password-gated.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { readProductExtras } from "@/lib/product-variants";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const supabase = createAdminClient() as unknown as SupabaseClient;
    const extras = await readProductExtras(supabase, params.id);
    return NextResponse.json(extras);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load product details" },
      { status: 500 },
    );
  }
}
