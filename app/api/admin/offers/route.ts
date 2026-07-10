// ============================================================
// Admin API — offers list (GET) + create (POST). Service-role,
// password-gated. Mirrors app/api/admin/products/route.ts.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import {
  OFFER_WITH_RULES_SELECT,
  buildOfferRow,
  extractChildRules,
  isExclusionViolation,
  syncOfferRules,
  validateOfferBody,
  EXCLUSION_MESSAGE,
} from "@/lib/offers-admin";

export const dynamic = "force-dynamic";

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const supabase = adminDb();
    const { data, error, count } = await supabase
      .from("offers")
      .select(OFFER_WITH_RULES_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ offers: data, total: count ?? 0 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load offers" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const body = await req.json();

    const invalid = validateOfferBody(body);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const supabase = adminDb();
    const { data, error } = await supabase
      .from("offers")
      .insert(buildOfferRow(body))
      .select("id")
      .single();

    if (error) {
      // The DB rejects a second overlapping non-stackable offer — surface it
      // as a friendly conflict rather than a raw Postgres error.
      if (isExclusionViolation(error)) {
        return NextResponse.json({ error: EXCLUSION_MESSAGE }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await syncOfferRules(supabase, data.id, extractChildRules(body));
    return NextResponse.json({ offer: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create offer" },
      { status: 500 },
    );
  }
}
