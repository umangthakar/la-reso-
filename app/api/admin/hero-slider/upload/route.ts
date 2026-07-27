// ============================================================
// Admin API — hero slider PNG upload.
// Service-role, password-gated. Schema: supabase/sql/36_hero_slider.sql.
//
// ONE REQUEST DOES BOTH HALVES: it writes the file to
// site-assets/hero-slider/ and inserts the hero_slider_images row, and if the
// insert fails it deletes the file it just wrote. That is deliberate, and it is
// why there is no separate "create row" endpoint (see ../route.ts):
//
//   * two endpoints — upload, then create — leave the browser holding a
//     half-finished operation. A closed tab, a dropped connection or a 500
//     between the two calls strands the file in the bucket with no row
//     pointing at it: paid-for bytes nothing will ever show or clean up.
//   * with both halves here, the only two outcomes visible to a caller are
//     "file and row exist" or "neither does".
//
// Storage has no transactions, so the rollback is explicit rather than free.
// The remaining failure mode is narrow and reported honestly: if the
// compensating delete ALSO fails, the response says the file was left behind
// instead of claiming a clean rollback.
//
// The pre-existing /api/admin/site-assets/upload is untouched and still serves
// every other admin image. It is not reused here because it does one thing this
// module cannot accept — it uploads and returns a URL, with no row to tie the
// file to and no way to undo the write when the row fails — and it applies none
// of the hero's PNG / size / dimension rules.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import {
  HERO_SLIDER_ADMIN_SELECT,
  HERO_SLIDER_BUCKET,
  HERO_SLIDER_ERRORS,
  heroSliderPath,
  newHeroSliderFilename,
  normaliseHeroSliderImage,
  validateHeroSliderBytes,
} from "@/lib/hero-slider";

export const dynamic = "force-dynamic";
// sharp is a native module — it cannot run on the edge runtime. Route handlers
// already default to nodejs; this is stated so a later edge migration fails
// here at build time rather than at the first upload.
export const runtime = "nodejs";

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

/** products.id is a uuid; anything else is not worth sending to the database. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  // Step 1 — authorisation, before the body is even read. An unauthenticated
  // caller must not be able to make the server buffer a 10 MB upload.
  if (!isAuthedRequest(req)) {
    return bad("Not authorised", 401);
  }

  // ----------------------------------------------------------
  // Step 2 — read the file out of the multipart body.
  // ----------------------------------------------------------
  let file: File;
  // The product this image advertises, chosen in the upload dialog and sent
  // alongside the bytes. Optional on the wire — an image can be uploaded
  // unlinked and linked afterwards from the list — but the dialog requires it,
  // so in practice it is always here.
  let productId: string | null = null;
  try {
    const form = await req.formData();
    const field = form.get("file");
    if (!(field instanceof File)) return bad("No file provided");
    file = field;

    const chosen = form.get("productId");
    if (typeof chosen === "string" && chosen.trim()) {
      const id = chosen.trim();
      // Shape only. That the id names a real product is the foreign key's job,
      // and its failure is translated in the rollback below — checking it here
      // as well would be a second query that a concurrent delete could still
      // invalidate between the check and the insert.
      if (!UUID.test(id)) return bad("The selected product is not valid.");
      productId = id;
    }
  } catch {
    // A truncated or malformed multipart body — a connection dropped
    // mid-upload, typically.
    return bad("The upload was interrupted. Please try again.");
  }

  // ----------------------------------------------------------
  // Step 3 — validate. Same rules the admin page already applied, re-run here
  // because this endpoint is reachable without that page.
  // ----------------------------------------------------------
  const bytes = new Uint8Array(await file.arrayBuffer());

  const failure = validateHeroSliderBytes(bytes);
  if (failure) return bad(failure);

  // The header said PNG and gave usable dimensions. Now prove the whole file
  // decodes: everything above reads the first 24 bytes, so a PNG truncated
  // mid-stream, or one with a corrupt IDAT, still passes it. sharp is the only
  // check here that touches the pixel data.
  try {
    const meta = await sharp(bytes).metadata();
    // Belt and braces: sharp agreeing it is a PNG guards against a file that
    // opens with a PNG signature but is actually another format underneath.
    if (meta.format !== "png") return bad(HERO_SLIDER_ERRORS.notPng);
    // Force a full decode. metadata() only parses headers, so a truncated
    // image resolves fine there and fails here — which is the point.
    await sharp(bytes).png().toBuffer();
  } catch {
    return bad(HERO_SLIDER_ERRORS.unreadable);
  }

  const supabase = adminDb();

  // ----------------------------------------------------------
  // Step 4 — write the file. Unique name + upsert:false, so an existing
  // object can never be overwritten; a name collision fails loudly instead.
  // ----------------------------------------------------------
  const path = heroSliderPath(newHeroSliderFilename());

  const uploaded = await supabase.storage
    .from(HERO_SLIDER_BUCKET)
    .upload(path, bytes, {
      cacheControl: "3600",
      upsert: false,
      contentType: "image/png",
    });

  if (uploaded.error) {
    // A duplicate key here means a UUID collision, which in practice means
    // something is wrong rather than unlucky — say so plainly instead of
    // reporting a raw storage error the admin can do nothing with.
    const message = /exist|duplicate/i.test(uploaded.error.message)
      ? "That filename is already taken. Please try the upload again."
      : `Upload failed: ${uploaded.error.message}`;
    return bad(message, 502);
  }

  // ----------------------------------------------------------
  // Step 5 — insert the row. From here on, any failure must take the file
  // with it.
  // ----------------------------------------------------------
  try {
    // display_order = MAX + 1, so a new image lands at the end of the list.
    // Read the current max rather than counting rows: deletes leave gaps, and
    // count() would hand out a number an existing row already holds.
    //
    // Not race-free — two uploads overlapping could read the same max and both
    // take it. That is accepted: this is a single-admin panel, the column has
    // no unique constraint, and the consequence is two images sharing a
    // position, which the list already resolves deterministically by falling
    // back to created_at. Serialising it would need a DB-side sequence or an
    // advisory lock for no practical gain.
    const highest = await supabase
      .from("hero_slider_images")
      .select("display_order")
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (highest.error) throw new Error(highest.error.message);

    const nextOrder = (highest.data?.display_order ?? -1) + 1;

    const inserted = await supabase
      .from("hero_slider_images")
      .insert({
        image_url: publicUrl(supabase, path),
        display_order: nextOrder,
        visible: true,
        product_id: productId,
      })
      .select(HERO_SLIDER_ADMIN_SELECT)
      .single();

    if (inserted.error) {
      // A foreign key violation means the chosen product was deleted between
      // the dialog opening and this insert. Said plainly, it is something the
      // admin can fix; as a raw Postgres message it is not.
      throw new Error(
        /foreign key|violates/i.test(inserted.error.message)
          ? "The selected product no longer exists. Refresh the page and try again."
          : inserted.error.message,
      );
    }

    // Both halves succeeded. The row is returned so the admin page can render
    // the new image without a refetch.
    return NextResponse.json({
      image: normaliseHeroSliderImage(inserted.data),
      // Kept for parity with the other admin upload endpoints, whose callers
      // all expect { url }.
      url: publicUrl(supabase, path),
    });
  } catch (e) {
    // ---- ROLLBACK ----
    // The row did not land, so the file must not survive either.
    const removed = await supabase.storage.from(HERO_SLIDER_BUCKET).remove([path]);
    const dbMessage = e instanceof Error ? e.message : "Database error";

    if (removed.error) {
      // Both the insert and its compensation failed. Reporting a clean
      // rollback here would be a lie, and the leftover object is something a
      // human needs to know about — it is invisible to the admin UI, since no
      // row points at it.
      return NextResponse.json(
        {
          error:
            `Saving the image failed (${dbMessage}), and the uploaded file could not be ` +
            `removed automatically. Please delete ${path} from the ${HERO_SLIDER_BUCKET} ` +
            `bucket in Supabase Storage.`,
        },
        { status: 500 },
      );
    }

    return bad(`Saving the image failed: ${dbMessage}. Nothing was kept.`, 500);
  }
}

/** Public URL for a stored object. Matches what every other image column in
 *  this schema holds, and the host is already allow-listed in next.config.mjs. */
function publicUrl(supabase: SupabaseClient, path: string): string {
  return supabase.storage.from(HERO_SLIDER_BUCKET).getPublicUrl(path).data.publicUrl;
}
