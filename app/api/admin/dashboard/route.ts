// ============================================================
// Admin API — dashboard stats (GET)
// Service-role, password-gated. Returns just the four headline numbers
// the dashboard shows, computed with COUNT/SUM aggregates and tightly
// scoped queries instead of pulling every order + line item into the
// browser:
//   - ordersToday      : COUNT(orders) since start-of-today
//   - pendingOrders    : COUNT(orders) where status in (received, preparing)
//   - revenueThisWeek  : SUM(orders.total) since start-of-week
//   - topProduct       : best-selling product (by units) this month
//
// The client passes the period boundaries (start-of-today/week/month, in
// epoch ms, local time) as query params so the buckets match the user's
// timezone exactly. Resilient to migration 08 not having run: the money /
// order_items queries degrade to zero/empty with schemaReady:false.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const PENDING = ["received", "preparing"];

function isoParam(url: URL, key: string): string {
  const ms = Number(url.searchParams.get(key));
  return new Date(Number.isFinite(ms) ? ms : Date.now()).toISOString();
}

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const supabase = createAdminClient() as unknown as SupabaseClient;
  const url = new URL(req.url);
  const todayIso = isoParam(url, "today");
  const weekIso = isoParam(url, "week");
  const monthIso = isoParam(url, "month");

  let schemaReady = true;

  // --- Orders today (COUNT, no rows fetched) ------------------
  const todayRes = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .gte("created_at", todayIso);
  const ordersToday = todayRes.count ?? 0;

  // --- Pending orders (COUNT, no rows fetched) ----------------
  const pendingRes = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("status", PENDING);
  const pendingOrders = pendingRes.count ?? 0;

  // --- Revenue this week (SUM aggregate) ----------------------
  // Try a server-side SUM first; if aggregate functions or the `total`
  // column aren't available, fall back to summing just this week's totals.
  let revenueThisWeek = 0;
  const sumRes = await supabase
    .from("orders")
    .select("total.sum()")
    .gte("created_at", weekIso)
    .maybeSingle();
  if (sumRes.error) {
    const totalsRes = await supabase
      .from("orders")
      .select("total")
      .gte("created_at", weekIso);
    if (totalsRes.error) {
      schemaReady = false;
    } else {
      revenueThisWeek = (totalsRes.data || []).reduce(
        (s, r) => s + (Number((r as { total: unknown }).total) || 0),
        0,
      );
    }
  } else {
    revenueThisWeek = Number((sumRes.data as { sum: unknown } | null)?.sum) || 0;
  }

  // --- Top product this month (only this month's line items) --
  let topProduct: { name: string; units: number } | null = null;
  const itemsRes = await supabase
    .from("order_items")
    .select("product_name,quantity,orders!inner(created_at)")
    .gte("orders.created_at", monthIso);
  if (itemsRes.error) {
    schemaReady = false;
  } else {
    const map = new Map<string, number>();
    for (const it of itemsRes.data || []) {
      const row = it as { product_name: string; quantity: unknown };
      map.set(row.product_name, (map.get(row.product_name) || 0) + (Number(row.quantity) || 0));
    }
    for (const [name, units] of Array.from(map)) {
      if (!topProduct || units > topProduct.units) topProduct = { name, units };
    }
  }

  return NextResponse.json({ ordersToday, pendingOrders, revenueThisWeek, topProduct, schemaReady });
}
