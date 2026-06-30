// ============================================================
// Admin API — look up an order for the refunds tool (GET ?q=)
// Service-role, password-gated. Accepts an order id (full or prefix) or
// a customer email and returns the most recent matching order with the
// fields the refunds screen needs.
//
// Requires the order columns from supabase/sql/06_payments.sql.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const ORDER_COLS =
  "id, customer_name, email, amount, status, created_at, stripe_payment_intent, refunded_at";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ error: "Enter an order # or email." }, { status: 400 });
  }

  const supabase = createAdminClient() as unknown as SupabaseClient;

  // 1) Exact order id.
  if (UUID_RE.test(q)) {
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_COLS)
      .eq("id", q)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return data
      ? NextResponse.json({ order: data })
      : NextResponse.json({ error: "No order found with that id." }, { status: 404 });
  }

  // 2) Email match (most recent first).
  if (q.includes("@")) {
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_COLS)
      .ilike("email", q)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return data && data.length
      ? NextResponse.json({ order: data[0] })
      : NextResponse.json({ error: "No order found for that email." }, { status: 404 });
  }

  // 3) Short order-id prefix: match against recent orders client-side.
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLS)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const hit = (data ?? []).find((o: { id: string }) =>
    o.id.toLowerCase().startsWith(q.toLowerCase()),
  );
  return hit
    ? NextResponse.json({ order: hit })
    : NextResponse.json(
        { error: "No matching order. Try the full order id or the customer email." },
        { status: 404 },
      );
}
