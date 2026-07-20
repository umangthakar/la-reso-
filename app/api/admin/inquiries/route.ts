// ============================================================
// GET /api/admin/inquiries — list + search Custom Cake Inquiries.
// ------------------------------------------------------------
// Service-role, password-gated. Supports ?q= search across Inquiry Number,
// customer name, phone, email and event type, plus ?status= filter. Returns
// full rows (normalised) so the admin table AND its details view render from
// one fetch.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { normalizeInquiry, INQUIRY_STATUSES } from "@/lib/inquiries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "").trim().toLowerCase();

  let supabase: SupabaseClient;
  try {
    supabase = createAdminClient() as unknown as SupabaseClient;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server not configured." },
      { status: 500 },
    );
  }

  let query = supabase
    .from("custom_inquiries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (status && INQUIRY_STATUSES.includes(status as (typeof INQUIRY_STATUSES)[number])) {
    query = query.eq("status", status);
  }

  if (q) {
    // Search across the key fields. Escape PostgREST's or() delimiters.
    const safe = q.replace(/[,()*]/g, " ").trim();
    if (safe) {
      const like = `%${safe}%`;
      query = query.or(
        [
          `inquiry_number.ilike.${like}`,
          `name.ilike.${like}`,
          `phone.ilike.${like}`,
          `email.ilike.${like}`,
          `event_type.ilike.${like}`,
        ].join(","),
      );
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const inquiries = (data ?? []).map((r) => normalizeInquiry(r as Record<string, unknown>));
  return NextResponse.json({ inquiries });
}
