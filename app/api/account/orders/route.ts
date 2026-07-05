// ============================================================
// GET /api/account/orders
// Returns the signed-in customer's orders. Authenticates via the
// Supabase session cookie (so we trust the verified email), then reads
// with the service role — this works regardless of whether the orders
// email RLS policy has been applied to the database.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // 1) Who is calling? Read the verified email from the session.
  let email: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? null;
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!email) {
    return NextResponse.json({ orders: [] });
  }

  // 2) Read that customer's orders with the service role (bypasses RLS),
  //    scoped strictly to their own verified email.
  let admin: SupabaseClient;
  try {
    admin = createAdminClient() as unknown as SupabaseClient;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server not configured." },
      { status: 500 },
    );
  }

  const { data, error } = await admin
    .from("orders")
    .select("id,status,created_at,delivery_date,total,amount")
    .eq("email", email)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ orders: data ?? [] });
}
