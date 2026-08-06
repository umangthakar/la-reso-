// ============================================================
// Admin API — list all orders (GET)
// Service-role, password-gated. Sees every order (bypasses the
// tracking-token RLS that limits the public anon key).
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

  // Only the columns the Orders table, detail drawer and PDF invoice use.
  //
  // DELIVERY FIELDS. `delivery_address`, `postcode` and `special_instructions`
  // are written on every order by lib/order-create and were simply never named
  // here, so the drawer had nothing to show — the address existed in the row the
  // whole time. They are read exactly as the customer's own order history reads
  // them (app/api/account/orders), so the two views can never disagree about
  // where an order is going.
  //
  // Three tiers, narrowing on error, so an older database degrades instead of
  // failing: the address columns come from 00_full_setup and delivery_date from
  // migration 04. A database missing either still returns exactly what it
  // returned before this change.
  const SELECTS = [
    "id,customer_name,email,phone,message,status,created_at,delivery_date,total,amount," +
      "delivery_address,postcode,special_instructions",
    "id,customer_name,email,phone,message,status,created_at,delivery_date,total,amount",
    "id,customer_name,email,phone,message,status,created_at",
  ];

  let orders: Record<string, unknown>[] | null = null;
  let lastError = "";
  for (const select of SELECTS) {
    const res = await supabase
      .from("orders")
      .select(select)
      .order("created_at", { ascending: false });
    if (!res.error) {
      orders = (res.data as unknown as Record<string, unknown>[]) || [];
      break;
    }
    lastError = res.error.message;
  }

  if (orders === null) {
    return NextResponse.json({ error: lastError }, { status: 500 });
  }

  return NextResponse.json({ orders });
}
