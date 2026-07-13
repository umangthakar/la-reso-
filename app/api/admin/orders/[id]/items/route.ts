// ============================================================
// Admin API — the line items on one order (GET)
//
// What the baker actually has to make: each cake, its quantity, and the
// resolved accessories/messages/notes recorded at checkout. Read from the
// order's OWN snapshot (order_items.customization), never re-derived from the
// live accessories config — repricing or deleting an accessory tomorrow must
// not rewrite an order placed today.
//
// Service-role, password-gated. Degrades to an empty list if
// 22_accessories.sql hasn't been run (the two columns won't exist yet).
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const FULL_COLS =
  "id,product_name,unit_price,quantity,line_total,addons_total,customization";
const CORE_COLS = "id,product_name,unit_price,quantity,line_total";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const supabase = createAdminClient() as unknown as SupabaseClient;

    const full = await supabase
      .from("order_items")
      .select(FULL_COLS)
      .eq("order_id", params.id);

    if (!full.error) return NextResponse.json({ items: full.data ?? [] });

    // Pre-22 database: the accessory columns don't exist. Still show the cakes.
    const core = await supabase
      .from("order_items")
      .select(CORE_COLS)
      .eq("order_id", params.id);
    if (core.error) {
      return NextResponse.json({ error: core.error.message }, { status: 500 });
    }
    return NextResponse.json({ items: core.data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load items" },
      { status: 500 },
    );
  }
}
