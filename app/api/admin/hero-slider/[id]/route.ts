// ============================================================
// Admin API — single hero slider image: edits (PATCH) and delete (DELETE).
// Service-role, password-gated.
// Schema: supabase/sql/36_hero_slider.sql + 37_hero_slider_product.sql.
//
//   PATCH  { visible? , product_id? }  → sets the fields that are present
//   DELETE                             → removes the row, then the file, then
//                                        closes the gap in display_order
//
// Both return the resulting list so the admin page can settle on what the
// database actually holds rather than trusting its optimistic guess.
//
// PATCH IS SPARSE, and the two fields are independent: the visibility toggle
// sends only `visible`, the product picker sends only `product_id`, and neither
// can clobber the other. That matters because both controls sit on the same
// row — a PATCH that took the whole row would make "hide this image" also write
// whatever product link the page happened to be holding.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import {
  HERO_SLIDER_ADMIN_SELECT,
  HERO_SLIDER_BUCKET,
  HERO_SLIDER_COLS,
  heroSliderStoragePath,
  normaliseHeroSliderImage,
  type HeroSliderImage,
} from "@/lib/hero-slider";

export const dynamic = "force-dynamic";

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

/** Every row, in display order — what both handlers hand back. */
async function listImages(supabase: SupabaseClient): Promise<HeroSliderImage[]> {
  const { data, error } = await supabase
    .from("hero_slider_images")
    .select(HERO_SLIDER_ADMIN_SELECT)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(normaliseHeroSliderImage);
}

/** The columns a PATCH is allowed to set, read out of an untrusted body — or
 *  the message explaining why the body can't be used.
 *
 *  An absent key means "leave it alone"; a present one is validated strictly.
 *  `product_id: null` is therefore a real instruction (unlink this image), not
 *  the same thing as omitting the key, which is why the two cannot be collapsed
 *  into a truthiness check. */
function parsePatch(body: unknown): { patch: Record<string, unknown> } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if ("visible" in b) {
    // Strictly boolean: a non-boolean would otherwise coerce to false and
    // silently hide an image the admin was trying to show.
    if (typeof b.visible !== "boolean") {
      return { error: "`visible` must be true or false." };
    }
    patch.visible = b.visible;
  }

  if ("product_id" in b) {
    const value = b.product_id;
    if (value === null || value === "") {
      patch.product_id = null;
    } else if (typeof value === "string" && UUID.test(value.trim())) {
      patch.product_id = value.trim();
    } else {
      // Shape-checked here; that the id names a real product is the foreign
      // key's job, and its failure is translated below.
      return { error: "`product_id` must be a product id, or null to unlink." };
    }
  }

  if (Object.keys(patch).length === 0) {
    return { error: "Nothing to update." };
  }
  return { patch };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// PATCH — visibility and/or the linked product
// ============================================================
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = parsePatch(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const supabase = adminDb();
    const updated = await supabase
      .from("hero_slider_images")
      .update(parsed.patch)
      .eq("id", params.id)
      .select(HERO_SLIDER_ADMIN_SELECT)
      .maybeSingle();

    if (updated.error) {
      // The foreign key rejecting an id that names no product is a 400 the
      // admin can act on ("that product is gone, pick another"), not a 500.
      if (/foreign key|violates/i.test(updated.error.message)) {
        return NextResponse.json(
          { error: "That product no longer exists. Refresh the page and pick another." },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: updated.error.message }, { status: 500 });
    }
    // No row matched — deleted from another tab between load and click.
    if (!updated.data) {
      return NextResponse.json(
        { error: "That image no longer exists. Refresh the page." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      image: normaliseHeroSliderImage(updated.data),
      images: await listImages(supabase),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update the image" },
      { status: 500 },
    );
  }
}

// ============================================================
// DELETE — row, then file, then close the gap
// ------------------------------------------------------------
// ORDER OF OPERATIONS, and why the row goes first.
//
// The row is the only thing the site can see. Deleting it first means the image
// stops being used immediately, and the worst case is a file that outlives its
// row for a moment. The reverse order — file first — would leave a live row
// pointing at a URL that 404s, which is a broken image on the storefront rather
// than a tidy-up job.
//
// If the file cannot be removed, the row is PUT BACK (same id, same
// created_at), so there is never a file in the bucket that nothing knows about.
// That is the rollback: the delete either takes both, or takes neither.
//
// A file that was ALREADY gone is not a failure — Storage's remove() does not
// error on a missing key, and "row deleted, no file to delete" is the desired
// end state, not a reason to resurrect the row.
// ============================================================
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  try {
    const supabase = adminDb();

    // 1. Read the row first — deleting is the only way to learn its image_url,
    //    and the file's key is derived from it. It is also the snapshot the
    //    rollback restores from.
    const existing = await supabase
      .from("hero_slider_images")
      .select(HERO_SLIDER_COLS)
      .eq("id", params.id)
      .maybeSingle();

    if (existing.error) {
      return NextResponse.json({ error: existing.error.message }, { status: 500 });
    }
    if (!existing.data) {
      return NextResponse.json(
        { error: "That image no longer exists. Refresh the page." },
        { status: 404 },
      );
    }

    const row = normaliseHeroSliderImage(existing.data);
    const path = heroSliderStoragePath(row.image_url);

    // 2. Delete the row.
    const removedRow = await supabase.from("hero_slider_images").delete().eq("id", row.id);
    if (removedRow.error) {
      return NextResponse.json({ error: removedRow.error.message }, { status: 500 });
    }

    // 3. Delete the file. `path` is null when the URL isn't one of ours (an
    //    external or hand-edited value) — there is then no file of ours to
    //    remove, and inventing a key to delete would be worse than skipping it.
    if (path) {
      const removedFile = await supabase.storage.from(HERO_SLIDER_BUCKET).remove([path]);

      if (removedFile.error) {
        // ---- ROLLBACK: put the row back exactly as it was. ----
        const restored = await supabase.from("hero_slider_images").insert({
          id: row.id,
          image_url: row.image_url,
          display_order: row.display_order,
          visible: row.visible,
          product_id: row.product_id,
          created_at: row.created_at,
        });

        if (restored.error) {
          // Both the storage delete and the restore failed. The row is gone and
          // the file is not — report it precisely, because nothing in the UI
          // can see that file any more.
          return NextResponse.json(
            {
              error:
                `The image file could not be deleted (${removedFile.error.message}) and the ` +
                `database row could not be restored (${restored.error.message}). The file ` +
                `${path} is still in the ${HERO_SLIDER_BUCKET} bucket — please remove it in ` +
                `Supabase Storage.`,
            },
            { status: 500 },
          );
        }

        return NextResponse.json(
          {
            error: `The image file could not be deleted: ${removedFile.error.message}. Nothing was removed.`,
          },
          { status: 502 },
        );
      }
    }

    // 4. Close the gap the delete left, so positions stay 0..n-1 with no holes.
    //    Done here rather than on the client so the database is gap-free no
    //    matter who deleted, and the next upload's MAX+1 can't collide.
    const images = await resequence(supabase);

    return NextResponse.json({ ok: true, images });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete the image" },
      { status: 500 },
    );
  }
}

/**
 * Renumber the remaining rows 0..n-1 in their current order and return the
 * result.
 *
 * One upsert of whole rows, for the same reason the reorder route uses one:
 * per-row updates can fail halfway and leave the list numbered inconsistently.
 *
 * Rows already sitting on the right number are filtered out first — after
 * deleting the last image there is nothing to renumber at all, and after
 * deleting the first, only the rows behind it move.
 */
async function resequence(supabase: SupabaseClient): Promise<HeroSliderImage[]> {
  const images = await listImages(supabase);

  const moved = images
    .map((image, index) => ({ image, index }))
    .filter(({ image, index }) => image.display_order !== index);

  if (moved.length === 0) return images;

  const { error } = await supabase.from("hero_slider_images").upsert(
    moved.map(({ image, index }) => ({
      id: image.id,
      image_url: image.image_url,
      visible: image.visible,
      product_id: image.product_id,
      created_at: image.created_at,
      display_order: index,
    })),
    { onConflict: "id" },
  );

  // The delete itself succeeded, so a failure here must not fail the request:
  // the list is correct, it is only still carrying a gap in its numbering,
  // which the next drop or delete closes. What goes back is then the numbering
  // the database ACTUALLY holds — claiming the tidied one would put the client
  // out of step with its own next refetch.
  if (error) return images;

  return images.map((image, index) => ({ ...image, display_order: index }));
}
