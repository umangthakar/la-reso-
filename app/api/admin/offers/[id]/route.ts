// ============================================================
// Admin API — single offer: full update (PUT), partial update for the
// enabled toggle (PATCH), and delete (DELETE). Service-role, password-gated.
// Mirrors app/api/admin/products/[id]/route.ts.
//
// When enabling a non-stackable offer, we DON'T pre-check for overlaps with a
// separate SELECT (that's a race) — we let the Phase-1 exclusion constraint be
// the source of truth and translate its violation into a 409.
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

// Single offer + its child rules — powers the admin edit screen (deep-linkable,
// so it must load fresh rather than relying on the list being in memory).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const supabase = adminDb();
    const { data, error } = await supabase
      .from("offers")
      .select(OFFER_WITH_RULES_SELECT)
      .eq("id", params.id)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ offer: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load offer" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
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
      .update(buildOfferRow(body))
      .eq("id", params.id)
      .select("id")
      .single();

    if (error) {
      if (isExclusionViolation(error)) {
        return NextResponse.json({ error: EXCLUSION_MESSAGE }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await syncOfferRules(supabase, params.id, extractChildRules(body));
    return NextResponse.json({ offer: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update offer" },
      { status: 500 },
    );
  }
}

// Partial update — used by the enabled toggle. Only the whitelisted scalar
// fields present in the body are written.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const patch: Record<string, unknown> = {};
    if ("enabled" in body) patch.enabled = body.enabled === true;
    if ("stackable" in body) patch.stackable = body.stackable === true;
    if ("priority" in body) patch.priority = Number(body.priority) || 0;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const supabase = adminDb();
    const { data, error } = await supabase
      .from("offers")
      .update(patch)
      .eq("id", params.id)
      .select("id")
      .single();

    if (error) {
      if (isExclusionViolation(error)) {
        return NextResponse.json({ error: EXCLUSION_MESSAGE }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ offer: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update offer" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  // Child rule/email/redemption rows drop via ON DELETE CASCADE (redemptions
  // keep the row but null the offer_id per the Phase-1 FK).
  const supabase = adminDb();
  const { error } = await supabase.from("offers").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
