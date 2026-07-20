// ============================================================
// PATCH /api/admin/inquiries/[id] — update an inquiry's status.
// ------------------------------------------------------------
// Service-role, password-gated. Sets the new status and stamps the matching
// timeline timestamp (contacted_at / confirmed_at / closed_at / cancelled_at)
// the first time that status is reached. The inquiry details themselves are
// never edited here.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import {
  INQUIRY_STATUSES,
  timestampColumnForStatus,
  type InquiryStatus,
} from "@/lib/inquiries";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { status?: string };
  const status = String(body.status ?? "").toLowerCase() as InquiryStatus;
  if (!INQUIRY_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  let supabase: SupabaseClient;
  try {
    supabase = createAdminClient() as unknown as SupabaseClient;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server not configured." },
      { status: 500 },
    );
  }

  const patch: Record<string, unknown> = { status };
  const stampCol = timestampColumnForStatus(status);
  if (stampCol) patch[stampCol] = new Date().toISOString();

  const { data, error } = await supabase
    .from("custom_inquiries")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inquiry: data });
}
