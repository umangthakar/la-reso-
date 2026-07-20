// ============================================================
// POST /api/account/inquiries/[id]/reopen
// ------------------------------------------------------------
// Lets a customer reopen their OWN closed/cancelled inquiry (status → 'new').
// Session-scoped: the row must belong to the caller's verified email. This is
// the only inquiry mutation a customer can make — they can never edit the
// details or delete an inquiry.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
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
  if (!email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let admin: SupabaseClient;
  try {
    admin = createAdminClient() as unknown as SupabaseClient;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server not configured." },
      { status: 500 },
    );
  }

  // Scope strictly to the caller's own row + only reopen when closed/cancelled.
  const { data: row, error: readErr } = await admin
    .from("custom_inquiries")
    .select("id,status,customer_email")
    .eq("id", params.id)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row || row.customer_email !== email) {
    return NextResponse.json({ error: "Inquiry not found." }, { status: 404 });
  }
  if (!["closed", "cancelled"].includes(String(row.status))) {
    return NextResponse.json({ error: "This inquiry is already open." }, { status: 400 });
  }

  const { error } = await admin
    .from("custom_inquiries")
    .update({ status: "new", closed_at: null, cancelled_at: null })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status: "new" });
}
