// ============================================================
// Admin API — policies list (GET) + create (POST)
// Service-role, password-gated. Schema: supabase/sql/19_policies.sql.
//
// Unlike /api/admin/products this list is NOT paginated: a bakery has a
// handful of policies, and the admin page drag-reorders the whole list, which
// only makes sense with every row on screen at once.
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
  POLICY_COLS,
} from "@/lib/policies-admin";
import { SLUG_INVALID_MESSAGE, SLUG_TAKEN_MESSAGE } from "@/lib/policies";

export const dynamic = "force-dynamic";

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  // Wrap the whole DB interaction so a client-level throw (e.g. the Supabase
  // host being unreachable) returns a clean JSON 500, not a raw stack trace.
  try {
    const supabase = adminDb();

    // display_order is the admin's drag order. created_at breaks ties, so rows
    // sharing an order (all 0 before the first drag) still list deterministically
    // instead of shuffling between loads.
    const { data, error } = await supabase
      .from("policies")
      .select(POLICY_COLS)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ policies: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load policies" },
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
    const supabase = adminDb();

    if (!String(body.title ?? "").trim()) {
      return NextResponse.json({ error: "A title is required." }, { status: 400 });
    }

    // Blank slug -> derived from the title; anything typed wins. Validates
    // format and uniqueness before we ever hit the DB constraint.
    const slug = await checkSlug(supabase, body);
    if (!slug.ok) {
      return NextResponse.json({ error: slug.error }, { status: slug.status });
    }

    const { data, error } = await supabase
      .from("policies")
      .insert(buildPolicyRow(body, slug.slug))
      .select("id")
      .single();

    // checkSlug() looked and found the slug free, but two admins saving at once
    // can still both pass that check — the UNIQUE index is what settles it.
    // Answer the loser with the same friendly 409, not a 500.
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
      { error: e instanceof Error ? e.message : "Failed to create policy" },
      { status: 500 },
    );
  }
}
