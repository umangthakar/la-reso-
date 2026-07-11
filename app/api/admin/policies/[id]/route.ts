// ============================================================
// Admin API — single policy: full update (PUT), partial update for the
// enable/disable toggle (PATCH), and delete (DELETE).
// Service-role, password-gated.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import {
  buildPolicyRow,
  checkSlug,
  isSlugConflict,
  isSlugFormatViolation,
} from "@/lib/policies-admin";
import { SLUG_INVALID_MESSAGE, SLUG_TAKEN_MESSAGE } from "@/lib/policies";

export const dynamic = "force-dynamic";

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const supabase = adminDb();

    if (!String(body.title ?? "").trim()) {
      return NextResponse.json({ error: "A title is required." }, { status: 400 });
    }

    // Same slug rules as create — but excluding THIS row, or the policy would
    // always collide with its own existing slug and never save.
    const slug = await checkSlug(supabase, body, params.id);
    if (!slug.ok) {
      return NextResponse.json({ error: slug.error }, { status: slug.status });
    }

    const { data, error } = await supabase
      .from("policies")
      .update(buildPolicyRow(body, slug.slug))
      .eq("id", params.id)
      .select("id")
      .single();

    if (isSlugConflict(error)) {
      return NextResponse.json({ error: SLUG_TAKEN_MESSAGE }, { status: 409 });
    }
    if (isSlugFormatViolation(error)) {
      return NextResponse.json({ error: SLUG_INVALID_MESSAGE }, { status: 400 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ policy: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update policy" },
      { status: 500 },
    );
  }
}

// Partial update — used by the Enabled toggle and by drag-reorder's optimistic
// single-row writes. Only the fields present in the body are written.
//
// `slug` is deliberately NOT in `allowed`: changing a URL is a real edit with
// uniqueness consequences, so it goes through PUT where checkSlug() runs. A
// toggle must never be able to smuggle one past that check.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const allowed = ["enabled", "display_order"] as const;
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const supabase = adminDb();
    const { data, error } = await supabase
      .from("policies")
      .update(patch)
      .eq("id", params.id)
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ policy: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update policy" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const supabase = adminDb();
    const { error } = await supabase.from("policies").delete().eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete policy" },
      { status: 500 },
    );
  }
}
