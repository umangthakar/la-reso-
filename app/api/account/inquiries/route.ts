// ============================================================
// GET /api/account/inquiries
// ------------------------------------------------------------
// Returns the signed-in customer's Custom Cake Inquiries, matched by their
// verified session email (against custom_inquiries.customer_email). Reads
// with the service role — RLS on the table denies anon/auth clients, so this
// route is the only way a customer sees their own inquiries. Same posture as
// /api/account/orders.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { normalizeInquiry } from "@/lib/inquiries";

export const dynamic = "force-dynamic";

export async function GET() {
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
  if (!email) return NextResponse.json({ inquiries: [] });

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
    .from("custom_inquiries")
    .select("*")
    .eq("customer_email", email)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const inquiries = (data ?? []).map((r) => normalizeInquiry(r as Record<string, unknown>));
  return NextResponse.json({ inquiries });
}
