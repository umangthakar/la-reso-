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
import { ACTIONABLE_STATUSES, sumRevenue } from "@/lib/order-status";

export const dynamic = "force-dynamic";

/**
 * Parse a required epoch-ms boundary param.
 *
 * The previous version did `Number.isFinite(ms) ? ms : Date.now()`, but
 * `Number(null)` — what you get for an ABSENT param — is 0, which IS finite. So
 * a missing `week` silently became 1970-01-01 and "revenue this week" quietly
 * reported revenue since the epoch. Rather than substitute a plausible-looking
 * default, an absent or unusable value is now a 400: a wrong number on the
 * owner's dashboard is worse than an error that says what is wrong.
 */
function isoParam(url: URL, key: string): { ok: true; iso: string } | { ok: false; error: string } {
  const raw = url.searchParams.get(key);
  if (raw === null || raw.trim() === "") {
    return { ok: false, error: `Missing required '${key}' timestamp.` };
  }
  const ms = Number(raw);
  // Reject 0/negative (the epoch bug), NaN, and anything outside a sane range.
  if (!Number.isFinite(ms) || ms <= 0) {
    return { ok: false, error: `Invalid '${key}' timestamp.` };
  }
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: `Invalid '${key}' timestamp.` };
  }
  return { ok: true, iso: date.toISOString() };
}

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const supabase = createAdminClient() as unknown as SupabaseClient;
  const url = new URL(req.url);

  const today = isoParam(url, "today");
  const week = isoParam(url, "week");
  const month = isoParam(url, "month");
  const badParam = [today, week, month].find((p) => !p.ok);
  if (badParam && !badParam.ok) {
    return NextResponse.json({ error: badParam.error }, { status: 400 });
  }
  const todayIso = (today as { ok: true; iso: string }).iso;
  const weekIso = (week as { ok: true; iso: string }).iso;
  const monthIso = (month as { ok: true; iso: string }).iso;

  let schemaReady = true;

  // --- Orders today (COUNT, no rows fetched) ------------------
  const todayRes = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .gte("created_at", todayIso);
  const ordersToday = todayRes.count ?? 0;

  // --- Pending orders (COUNT, no rows fetched) ----------------
  // ACTIONABLE_STATUSES is the shared definition (lib/order-status). This tile
  // previously used a local ["received","preparing"] list that omitted
  // 'pending' and 'ready', so it read 0 while brand-new orders sat waiting to
  // be accepted — the exact orders /api/cron/auto-cancel refunds after 24h.
  const pendingRes = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("status", ACTIONABLE_STATUSES as unknown as string[]);
  const pendingOrders = pendingRes.count ?? 0;

  // --- Revenue this week -------------------------------------
  // Cancelled and refunded orders must NOT count. That rules out the
  // server-side SUM() this used to do (it cannot express the payment_status
  // rule), so the week's rows are fetched and summed through the shared
  // sumRevenue() helper instead. The window is one week, so this is a small
  // read, and it is the same filter the Analytics page now applies.
  let revenueThisWeek = 0;
  const weekRows = await supabase
    .from("orders")
    .select("total,amount,status,payment_status")
    .gte("created_at", weekIso);
  if (weekRows.error) {
    // Older DB without payment_status → retry with the columns that do exist,
    // rather than reporting no revenue at all.
    const legacy = await supabase
      .from("orders")
      .select("total,status")
      .gte("created_at", weekIso);
    if (legacy.error) {
      schemaReady = false;
    } else {
      revenueThisWeek = sumRevenue(legacy.data ?? []);
    }
  } else {
    revenueThisWeek = sumRevenue(weekRows.data ?? []);
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
