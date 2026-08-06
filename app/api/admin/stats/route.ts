// ============================================================
// Admin API — unified stats + orders (GET)   ← SINGLE SOURCE OF TRUTH
// ------------------------------------------------------------
// Service-role, password-gated. This is the ONE endpoint the Dashboard,
// Orders and Analytics pages all read, so their order counts can never
// disagree. It fetches every order ONCE and returns:
//   - orders : the canonical order rows (Orders + Analytics render these)
//   - items  : line items w/ parent order date (top products)
//   - zones  : delivery-zone labels (Analytics zone breakdown)
//   - stats  : the headline numbers, computed from the SAME `orders`
//              array above so they always match what the pages display:
//                • totalOrders     — orders.length
//                • pendingOrders   — lib/order-status#ACTIONABLE_STATUSES
//                • ordersToday     — created since start-of-today
//                • revenueThisWeek — SUM(total) since start-of-week,
//                                    EXCLUDING cancelled / refunded
//                • topProduct      — best-selling product this month
//
// The client passes the period boundaries (start-of-today/week/month, in
// epoch ms, local time) as query params so the buckets match the user's
// timezone. Resilient to the analytics migration not having run: money /
// order_items / zones degrade to empty and `schemaReady:false` is set.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { isActionableStatus, sumRevenue } from "@/lib/order-status";

export const dynamic = "force-dynamic";

// "Needs action" and "counts as revenue" now come from lib/order-status, which
// /api/admin/dashboard and the Analytics page read too — this file used to hold
// its own copy of the pending set, and the dashboard's copy disagreed with it.
const isPending = isActionableStatus;

/** Parse an epoch-ms query param; NaN when absent/invalid (skips that stat). */
function msParam(url: URL, key: string): number {
  const ms = Number(url.searchParams.get(key));
  return Number.isFinite(ms) ? ms : NaN;
}

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    return await collectStats(req);
  } catch (err) {
    console.error("[admin/stats] failed:", err);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}

async function collectStats(req: Request) {
  const supabase = createAdminClient() as unknown as SupabaseClient;
  const url = new URL(req.url);
  const todayStart = msParam(url, "today");
  const weekStart = msParam(url, "week");
  const monthStart = msParam(url, "month");

  let schemaReady = true;

  // --- Orders: the single canonical source --------------------
  // Full (post-migration) shape first; fall back to the base enquiry columns
  // with zeroed money if the analytics columns don't exist yet.
  //
  // DELIVERY FIELDS. The Orders page renders its detail drawer and its PDF
  // invoice from THESE rows — this endpoint, not /api/admin/orders — so
  // `delivery_address`, `postcode` and `special_instructions` have to be named
  // here or the drawer has nothing to show. lib/order-create writes all three on
  // every order, under exactly these names; they are only ever read.
  //
  // Tried as their own tier, ahead of the analytics shape, so a database
  // predating those columns falls back to precisely what it returned before
  // (money and analytics intact, schemaReady still true) instead of collapsing
  // to the base enquiry columns.
  const ANALYTICS_COLUMNS =
    // payment_status is needed so revenue can exclude refunds (a delivered
    // order can still have been refunded afterwards).
    "id,customer_name,email,phone,message,status,payment_status,created_at,delivery_date,subtotal,delivery_charge,total,amount,zone_id";
  const ORDER_SELECTS = [
    `${ANALYTICS_COLUMNS},delivery_address,postcode,special_instructions`,
    ANALYTICS_COLUMNS,
  ];

  let orders: Record<string, unknown>[] = [];
  let ordersLoaded = false;
  for (const select of ORDER_SELECTS) {
    const res = await supabase
      .from("orders")
      .select(select)
      .order("created_at", { ascending: false });
    if (!res.error) {
      orders = (res.data as unknown as Record<string, unknown>[]) || [];
      ordersLoaded = true;
      break;
    }
  }

  if (!ordersLoaded) {
    schemaReady = false;
    const base = await supabase
      .from("orders")
      .select("id,customer_name,email,phone,message,status,created_at")
      .order("created_at", { ascending: false });
    if (base.error) {
      return NextResponse.json({ error: base.error.message }, { status: 500 });
    }
    orders = (base.data || []).map((o) => ({
      ...o,
      delivery_date: null,
      subtotal: 0,
      delivery_charge: 0,
      total: 0,
      amount: null,
      zone_id: null,
    }));
  }

  // --- Line items (top products) ------------------------------
  // Embeds the parent order's date so both the monthly top-product stat here
  // and the Analytics page's period filter work off the same rows.
  let items: Record<string, unknown>[] = [];
  const itemsRes = await supabase
    .from("order_items")
    // The parent order's status/payment_status ride along so the Top Products
    // table can leave out cancelled and refunded orders, exactly like the
    // revenue figures do.
    .select("product_name,quantity,line_total,order:orders!inner(created_at,status,payment_status)");
  if (itemsRes.error) schemaReady = false;
  else items = itemsRes.data || [];

  // --- Delivery zones (labels) --------------------------------
  let zones: Record<string, unknown>[] = [];
  const zonesRes = await supabase.from("delivery_zones").select("id,zone_name");
  if (zonesRes.error) schemaReady = false;
  else zones = zonesRes.data || [];

  // --- Headline stats: computed from the SAME `orders` array --
  // Deriving every number from the array we return above is what guarantees
  // the pages can never show contradictory counts.
  const orderTime = (o: Record<string, unknown>) =>
    new Date(String(o.created_at)).getTime();
  const money = (o: Record<string, unknown>) => Number(o.total ?? o.amount) || 0;

  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => isPending(o.status)).length;
  const ordersToday = Number.isNaN(todayStart)
    ? 0
    : orders.filter((o) => orderTime(o) >= todayStart).length;
  // Revenue excludes cancelled and refunded orders — see sumRevenue().
  const revenueThisWeek = Number.isNaN(weekStart)
    ? 0
    : sumRevenue(orders.filter((o) => orderTime(o) >= weekStart));

  // Top product this month — units summed from this month's line items.
  let topProduct: { name: string; units: number } | null = null;
  if (!Number.isNaN(monthStart)) {
    const map = new Map<string, number>();
    for (const it of items) {
      const parent = (it as { order?: { created_at?: string } | null }).order;
      if (!parent?.created_at) continue;
      if (new Date(parent.created_at).getTime() < monthStart) continue;
      const name = String((it as { product_name: unknown }).product_name);
      map.set(name, (map.get(name) || 0) + (Number((it as { quantity: unknown }).quantity) || 0));
    }
    for (const [name, units] of Array.from(map)) {
      if (!topProduct || units > topProduct.units) topProduct = { name, units };
    }
  }

  const stats = { totalOrders, pendingOrders, ordersToday, revenueThisWeek, topProduct };
  return NextResponse.json({ orders, items, zones, stats, schemaReady });
}
