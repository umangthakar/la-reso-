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
  // delivery_date comes from migration 04 — fall back without it (as the
  // old select(*) did) so the page still works before that migration runs.
  const full = await supabase
    .from("orders")
    .select("id,customer_name,email,phone,message,status,created_at,delivery_date,total,amount")
    .order("created_at", { ascending: false });

  let orders: Record<string, unknown>[] = [];
  if (full.error) {
    const base = await supabase
      .from("orders")
      .select("id,customer_name,email,phone,message,status,created_at")
      .order("created_at", { ascending: false });
    if (base.error) return NextResponse.json({ error: base.error.message }, { status: 500 });
    orders = base.data || [];
  } else {
    orders = full.data || [];
  }

  return NextResponse.json({ orders });
}
