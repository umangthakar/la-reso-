// ============================================================
// Admin API — analytics data (GET)
// Service-role, password-gated. Returns the raw rows the Analytics
// page and Dashboard aggregate client-side:
//   - orders  : money + status + date + zone (for revenue, summary,
//               zone breakdown, CSV export)
//   - items   : line items with their parent order's date (top products)
//   - zones   : id -> zone_name lookup
//
// Resilient to the 08 migration not having run yet: if the money
// columns / order_items / delivery_zones don't exist, each query
// degrades to empty/zeroed data and `schemaReady: false` is returned
// so the UI can prompt the admin to run the migration.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const supabase = createAdminClient() as unknown as SupabaseClient;
  let schemaReady = true;

  // --- Orders -------------------------------------------------
  // Try the full (post-migration) shape first; fall back to the base
  // enquiry columns with zeroed money if the new columns don't exist.
  let orders: Record<string, unknown>[] = [];
  const full = await supabase
    .from("orders")
    .select(
      "id,customer_name,email,phone,status,created_at,subtotal,delivery_charge,total,zone_id",
    )
    .order("created_at", { ascending: false });

  if (full.error) {
    schemaReady = false;
    const base = await supabase
      .from("orders")
      .select("id,customer_name,email,phone,status,created_at")
      .order("created_at", { ascending: false });
    orders = (base.data || []).map((o) => ({
      ...o,
      subtotal: 0,
      delivery_charge: 0,
      total: 0,
      zone_id: null,
    }));
  } else {
    orders = full.data || [];
  }

  // --- Line items (top products) ------------------------------
  // Embeds the parent order's date so the client can filter items by period.
  let items: Record<string, unknown>[] = [];
  const itemsRes = await supabase
    .from("order_items")
    .select("product_name,quantity,line_total,order:orders!inner(created_at)");
  if (itemsRes.error) schemaReady = false;
  else items = itemsRes.data || [];

  // --- Delivery zones (labels) --------------------------------
  let zones: Record<string, unknown>[] = [];
  const zonesRes = await supabase.from("delivery_zones").select("id,zone_name");
  if (zonesRes.error) schemaReady = false;
  else zones = zonesRes.data || [];

  return NextResponse.json({ orders, items, zones, schemaReady });
}
