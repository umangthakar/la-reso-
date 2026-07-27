// ============================================================
// Admin API — persist drag-to-reorder for hero slider images.
// Service-role, password-gated. Schema: supabase/sql/36_hero_slider.sql.
//
// Contract:  POST { order: [{ id, display_order }] }
//
// The admin page renumbers the whole list 0..n-1 after a drop and sends all of
// it, so a partial or conflicting set of positions cannot be produced by the
// UI. This route still validates that, because a hand-made request can.
//
// WHY ONE UPSERT AND NOT N UPDATES
//
// /api/admin/policies/reorder fires one UPDATE per row through Promise.all.
// That is fine until one of them fails: the successful ones have already
// committed, so the list is left half-reordered in the database, and the client
// has no way to know which half. This route sends every row in a single upsert
// instead — PostgREST runs one statement in one transaction, so either every
// position moves or none does.
//
// The cost of that guarantee is a read first: an upsert has to carry whole
// rows (image_url is NOT NULL, so an id + display_order pair alone would be
// rejected before the conflict clause is ever reached), so the current rows are
// fetched and merged with the new positions.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import {
  HERO_SLIDER_ADMIN_SELECT,
  HERO_SLIDER_COLS,
  normaliseHeroSliderImage,
} from "@/lib/hero-slider";

export const dynamic = "force-dynamic";

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

type OrderEntry = { id: string; display_order: number };

/** Pull a clean list of {id, display_order} out of an untrusted body, or an
 *  error message describing why it can't be used. */
function parseOrder(body: unknown): { order: OrderEntry[] } | { error: string } {
  const raw = (body as { order?: unknown } | null)?.order;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "Nothing to reorder" };
  }
  const order: OrderEntry[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const o = (item ?? {}) as { id?: unknown; display_order?: unknown };
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const position = Number(o.display_order);
    if (!id || !Number.isInteger(position) || position < 0) {
      return { error: "Invalid order payload" };
    }
    // The same image twice would make its final position depend on which
    // update landed last.
    if (seen.has(id)) return { error: "Invalid order payload: duplicate id" };
    seen.add(id);
    order.push({ id, display_order: position });
  }
  return { order };
}

export async function POST(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = parseOrder(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const supabase = adminDb();

    // Read the rows being moved. Also the authorisation check on the ids: an
    // id that isn't here doesn't exist, and inserting it as a "new" row is
    // exactly what an upsert would otherwise do.
    const current = await supabase
      .from("hero_slider_images")
      .select(HERO_SLIDER_COLS)
      .in(
        "id",
        parsed.order.map((o) => o.id),
      );

    if (current.error) {
      return NextResponse.json({ error: current.error.message }, { status: 500 });
    }

    const rows = (current.data ?? []).map(normaliseHeroSliderImage);
    if (rows.length !== parsed.order.length) {
      // Something in the payload is gone — most likely another tab deleted an
      // image between this page loading and the drop. Say so, and let the
      // client refetch rather than silently reordering a stale list.
      return NextResponse.json(
        { error: "The list has changed. Refresh the page and try again." },
        { status: 409 },
      );
    }

    const positions = new Map(parsed.order.map((o) => [o.id, o.display_order]));

    // Whole rows, with only display_order changed. created_at is carried so the
    // upsert cannot reset it to now() and scramble the tie-break ordering, and
    // product_id for the same reason: a reorder must never quietly unlink an
    // image from its product.
    const merged = rows.map((row) => ({
      id: row.id,
      image_url: row.image_url,
      visible: row.visible,
      product_id: row.product_id,
      created_at: row.created_at,
      display_order: positions.get(row.id) as number,
    }));

    const saved = await supabase
      .from("hero_slider_images")
      .upsert(merged, { onConflict: "id" })
      .select(HERO_SLIDER_ADMIN_SELECT);

    if (saved.error) {
      return NextResponse.json({ error: saved.error.message }, { status: 500 });
    }

    // The saved rows go back so the client can settle on what the database
    // actually holds instead of trusting its own optimistic guess.
    return NextResponse.json({
      ok: true,
      images: (saved.data ?? [])
        .map(normaliseHeroSliderImage)
        .sort((a, b) => a.display_order - b.display_order),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save the new order" },
      { status: 500 },
    );
  }
}
