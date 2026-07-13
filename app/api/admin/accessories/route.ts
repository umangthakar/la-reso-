// ============================================================
// Admin API — accessory categories + accessories
//
//   GET  /api/admin/accessories   the whole tree (categories → accessories),
//                                 INCLUDING disabled rows, which the storefront
//                                 never sees
//   POST /api/admin/accessories   create a category or an accessory:
//                                 { kind: "category" | "accessory", ... }
//
// Service-role, password-gated. Schema: supabase/sql/22_accessories.sql.
// Not paginated — a bakery has a handful of categories, and the page sorts the
// whole list, which only makes sense with every row on screen at once.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { fetchAccessoryCategories } from "@/lib/customization";
import {
  buildAccessoryRow,
  buildCategoryRow,
  isDuplicateKey,
  DUPLICATE_KEY_MESSAGE,
} from "@/lib/accessories-admin";

export const dynamic = "force-dynamic";

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    // includeInactive: the admin must be able to see and re-enable what they
    // disabled. The storefront read (/api/customization) never passes this.
    const categories = await fetchAccessoryCategories(adminDb(), {
      includeInactive: true,
    });
    return NextResponse.json({ categories });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load accessories" },
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

    if (body.kind === "category") {
      const row = buildCategoryRow(body, { creating: true });
      if ("error" in row) {
        return NextResponse.json({ error: row.error }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("accessory_categories")
        .insert(row.row)
        .select("id")
        .single();
      if (isDuplicateKey(error)) {
        return NextResponse.json({ error: DUPLICATE_KEY_MESSAGE }, { status: 409 });
      }
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ id: data.id });
    }

    if (body.kind === "accessory") {
      const row = buildAccessoryRow(body, { creating: true });
      if ("error" in row) {
        return NextResponse.json({ error: row.error }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("accessories")
        .insert(row.row)
        .select("id")
        .single();
      if (isDuplicateKey(error)) {
        return NextResponse.json({ error: DUPLICATE_KEY_MESSAGE }, { status: 409 });
      }
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ id: data.id });
    }

    return NextResponse.json(
      { error: "Specify kind: 'category' or 'accessory'." },
      { status: 400 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save" },
      { status: 500 },
    );
  }
}
