// ============================================================
// Admin API — POST /api/admin/offers/[id]/duplicate
// Reads an offer plus its category / product / email rules and inserts a
// disabled copy (" (copy)" appended to the name). The copy's coupon_code is
// cleared so it can't collide with the original's unique code, and enabled is
// false so it can't trip the non-stackable exclusion constraint on create.
// Service-role, password-gated.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { OFFER_WITH_RULES_SELECT, syncOfferRules, type ChildRules } from "@/lib/offers-admin";

export const dynamic = "force-dynamic";

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const supabase = adminDb();

    const { data: src, error: readErr } = await supabase
      .from("offers")
      .select(OFFER_WITH_RULES_SELECT)
      .eq("id", params.id)
      .single();

    if (readErr || !src) {
      return NextResponse.json({ error: readErr?.message ?? "Offer not found" }, { status: 404 });
    }

    const row = src as Record<string, unknown>;
    const {
      id: _id,
      created_at: _created,
      updated_at: _updated,
      offer_category_rules: catRules,
      offer_product_rules: prodRules,
      offer_emails: emailRules,
      ...rest
    } = row;

    const copy = {
      ...rest,
      name: `${String(row.name ?? "Offer")} (copy)`,
      enabled: false,
      coupon_code: null, // a coupon code is unique — the copy needs its own
    };

    const { data: created, error: insErr } = await supabase
      .from("offers")
      .insert(copy)
      .select("id")
      .single();

    if (insErr || !created) {
      return NextResponse.json({ error: insErr?.message ?? "Failed to duplicate offer" }, { status: 500 });
    }

    const rules: ChildRules = {
      categoryRules: (Array.isArray(catRules) ? catRules : []).map((c: Record<string, unknown>) => ({
        category: String(c.category ?? ""),
        mode: c.mode === "exclude" ? "exclude" : "include",
      })),
      productRules: (Array.isArray(prodRules) ? prodRules : []).map((p: Record<string, unknown>) => ({
        product_id: String(p.product_id ?? ""),
        mode: p.mode === "exclude" ? "exclude" : "include",
      })),
      emails: (Array.isArray(emailRules) ? emailRules : []).map((e: Record<string, unknown>) =>
        String(e.email ?? ""),
      ),
    };
    await syncOfferRules(supabase, created.id, rules);

    return NextResponse.json({ id: created.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to duplicate offer" },
      { status: 500 },
    );
  }
}
