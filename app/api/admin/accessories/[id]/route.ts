// ============================================================
// Admin API — one accessory category or accessory
//
//   PATCH  /api/admin/accessories/[id]?kind=category|accessory
//          Full save, or a partial one: { active: false } is the
//          enable/disable switch, { sort_order: n } is the reorder.
//   DELETE /api/admin/accessories/[id]?kind=category|accessory
//          Deleting a CATEGORY cascades to its accessories (FK on delete
//          cascade). Placed orders are untouched — they carry their own
//          resolved snapshot, by design.
//
// Service-role, password-gated. Schema: supabase/sql/22_accessories.sql.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
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

/** "category" → accessory_categories, anything else → accessories. */
function tableFor(req: Request): "accessory_categories" | "accessories" {
  const kind = new URL(req.url).searchParams.get("kind");
  return kind === "category" ? "accessory_categories" : "accessories";
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const table = tableFor(req);

    // A partial update (the enable/disable switch, the sort buttons) carries
    // only the fields it changes — running it through the full builder would
    // blank everything else. Recognise that shape and pass it straight through.
    const keys = Object.keys(body);
    const isPartial =
      keys.length > 0 &&
      keys.every((k) => k === "active" || k === "sort_order" || k === "is_default");

    let patch: Record<string, unknown>;
    if (isPartial) {
      patch = {};
      if ("active" in body) patch.active = body.active === true;
      if ("sort_order" in body) patch.sort_order = Math.trunc(Number(body.sort_order) || 0);
      if ("is_default" in body) patch.is_default = body.is_default === true;
    } else {
      const built =
        table === "accessory_categories"
          ? buildCategoryRow(body, { creating: false })
          : buildAccessoryRow(body, { creating: false });
      if ("error" in built) {
        return NextResponse.json({ error: built.error }, { status: 400 });
      }
      patch = built.row as Record<string, unknown>;
    }

    const supabase = adminDb();
    const { error } = await supabase.from(table).update(patch).eq("id", params.id);

    if (isDuplicateKey(error)) {
      return NextResponse.json({ error: DUPLICATE_KEY_MESSAGE }, { status: 409 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const supabase = adminDb();
    const { error } = await supabase.from(tableFor(req)).delete().eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete" },
      { status: 500 },
    );
  }
}
