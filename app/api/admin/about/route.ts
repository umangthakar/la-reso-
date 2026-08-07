// ============================================================
// Admin API — the About Us page (GET current content + PUT save)
// Service-role, password-gated. Schema: supabase/sql/47_about_page.sql.
//
// The content is one jsonb object on the site_settings singleton, so this route
// writes the same column set the rest of Content & Settings does, through the
// same service-role client. What it adds over a plain settings PUT is the two
// things a page with an IMAGE needs and a plain field save does not:
//
//   1. ORPHAN CLEANUP. Saving a new photo deletes the one it replaced, and any
//      photo that was uploaded during this edit and then swapped out or removed
//      before Save. The bucket is never left holding a file nothing points at.
//   2. REVALIDATION. The About page and the site-settings cache tag are
//      invalidated on the way out, so the change is live with no manual step.
//
// ORDER OF OPERATIONS: the database is written FIRST, then the files are
// deleted. A failed write therefore deletes nothing — the admin still has their
// old photo and their unsaved form. A failed delete does not fail the request:
// the content genuinely did save, and the honest report is "saved, but this file
// is still in the bucket", not a 500 that makes the admin re-enter their work.
//
// SECURITY: isAuthedRequest() gates both handlers, exactly as every other admin
// route. The service-role key, the bucket credentials and the row id never
// appear in a response; the only identifier that leaves here is the public
// storage URL that the storefront already renders.
// ============================================================

import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { adminEmailFromRequest, isAuthedRequest } from "@/lib/admin-auth";
import { TAGS } from "@/lib/cache-tags";
import {
  ABOUT_IMAGE_BUCKET,
  aboutContentForStorage,
  aboutImageStoragePath,
  type AboutContent,
} from "@/lib/about-content";

export const dynamic = "force-dynamic";

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

/**
 * One audit line per action, with WHO, WHEN and whether it worked.
 *
 * console, not a table: this panel has a single shared login (lib/admin-auth),
 * so an audit_log table would record the same actor on every row while adding a
 * migration, a write on the hot path and a second thing that can fail during a
 * save. The platform's log drain already timestamps, retains and searches these,
 * and the format matches the rest of the admin routes ("[scope] …"), so they
 * read as one stream.
 *
 * The admin's email is the closest thing to an admin ID this auth model has; it
 * is written to the server log only, never returned to the browser.
 */
function log(
  req: Request,
  action: string,
  ok: boolean,
  detail: Record<string, unknown> = {},
): void {
  const line = {
    action,
    result: ok ? "success" : "failure",
    admin: adminEmailFromRequest(req) ?? "unknown",
    at: new Date().toISOString(),
    ...detail,
  };
  if (ok) console.info("[admin/about]", JSON.stringify(line));
  else console.error("[admin/about]", JSON.stringify(line));
}

/**
 * The one failure that is a SETUP step rather than a bug: site_settings has no
 * `about_page` column, because 47_about_page.sql has not been run yet.
 *
 * Postgres reports it as 42703 ("column … does not exist") on a read and
 * PostgREST as PGRST204 ("could not find the column … in the schema cache") on
 * a write, and neither message tells a non-technical owner what to DO. Both are
 * translated into the one sentence that fixes it — the same courtesy the other
 * admin routes extend to foreign-key violations.
 */
function isMissingColumn(message: string): boolean {
  return /about_page/i.test(message) && /does not exist|schema cache|42703|PGRST204/i.test(message);
}

const SETUP_REQUIRED =
  "The About Us content hasn’t been set up in the database yet. Run " +
  "supabase/sql/47_about_page.sql in the Supabase SQL editor, then reload this page. " +
  "The public About page is unaffected in the meantime — it shows the built-in wording.";

/** The singleton's id and its current About content, or null when no row
 *  exists yet (a fresh database — the PUT then inserts one). */
async function readRow(
  supabase: SupabaseClient,
): Promise<{ id: string; about: AboutContent } | null> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("id,about_page")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id as string,
    about: aboutContentForStorage(data.about_page),
  };
}

// ============================================================
// GET — what the admin form loads
// ------------------------------------------------------------
// Returns the STORED object, not the rendered one: a field the admin has never
// touched comes back as "", and the form shows the built-in wording as a
// placeholder. Returning the resolved defaults instead would make every field
// look filled in, and the first save would freeze today's copy into the row,
// where it would silently stop tracking the code.
// ============================================================
export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const row = await readRow(adminDb());
    return NextResponse.json({ about: row?.about ?? aboutContentForStorage(null) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load the About page content";
    log(req, "content.read", false, { error: message });
    if (isMissingColumn(message)) {
      return NextResponse.json({ error: SETUP_REQUIRED }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================
// PUT — save the content, then tidy the bucket, then revalidate
// ============================================================
export async function PUT(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Every field is cleaned and capped here, against an untrusted body — the
  // admin page applies the same rules for a live character count, but this is
  // the copy that decides what is stored.
  const about = aboutContentForStorage(body.about);

  // Photos this edit uploaded and then abandoned (replaced, or removed before
  // Save). The client reports them; the server still checks each one is an
  // about photo of ours before deleting anything, so a forged list can only
  // ever name files this module owns.
  const discarded = Array.isArray(body.discarded_image_urls)
    ? body.discarded_image_urls.filter((u): u is string => typeof u === "string")
    : [];

  const supabase = adminDb();

  // ---- 1. Write. Nothing is deleted until this succeeds. ----
  let previous: AboutContent | null = null;
  try {
    const row = await readRow(supabase);
    previous = row?.about ?? null;

    const result = row
      ? await supabase.from("site_settings").update({ about_page: about }).eq("id", row.id)
      : await supabase.from("site_settings").insert({ about_page: about });

    if (result.error) throw new Error(result.error.message);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save";
    log(req, "content.update", false, { error: message });
    // The client keeps every form value on a non-2xx, so nothing is lost.
    if (isMissingColumn(message)) {
      return NextResponse.json({ error: SETUP_REQUIRED }, { status: 503 });
    }
    return NextResponse.json(
      { error: `Could not save the About page: ${message}` },
      { status: 500 },
    );
  }

  const replacedImage = Boolean(previous && previous.image_url !== about.image_url);
  log(req, replacedImage ? "content.update+image.replace" : "content.update", true, {
    image_url: about.image_url || "(none)",
  });

  // ---- 2. Tidy the bucket. Best effort, honestly reported. ----
  const warning = await deleteOrphans(req, supabase, [
    // The photo that was just replaced or removed.
    ...(previous && previous.image_url !== about.image_url ? [previous.image_url] : []),
    // Anything uploaded during this edit that is not what got saved.
    ...discarded,
  ], about.image_url);

  // ---- 3. Revalidate. ----
  // The About page is `force-dynamic` and every settings read is `no-store`, so
  // the change is already live on the next request — these calls exist so that
  // stays true if a future edit opts either surface into caching, and they are
  // the documented invalidation points for this content.
  revalidatePath("/about");
  revalidateTag(TAGS.siteSettings);
  log(req, "cache.revalidate", true, { paths: ["/about"], tags: [TAGS.siteSettings] });

  return NextResponse.json({ about, ...(warning ? { warning } : {}) });
}

/**
 * Delete every about photo in `urls` that is ours, is not the one just saved,
 * and has not already been handled. Returns a message to show the admin when
 * something could not be removed, or "" when the bucket is clean.
 *
 * `aboutImageStoragePath` returning null is the safety gate, not an error: the
 * built-in Unsplash default, an external URL and an object elsewhere in the
 * shared bucket all resolve to null and are skipped rather than guessed at.
 * Storage's remove() does not error on a key that is already gone, so a repeat
 * save is harmless.
 */
async function deleteOrphans(
  req: Request,
  supabase: SupabaseClient,
  urls: string[],
  keepUrl: string,
): Promise<string> {
  const keep = aboutImageStoragePath(keepUrl);
  const paths = Array.from(
    new Set(
      urls
        .map(aboutImageStoragePath)
        .filter((p): p is string => p !== null && p !== keep),
    ),
  );
  if (paths.length === 0) return "";

  const { error } = await supabase.storage.from(ABOUT_IMAGE_BUCKET).remove(paths);

  if (error) {
    log(req, "image.delete", false, { paths, error: error.message });
    return (
      `Your changes were saved, but the previous photo could not be removed from storage ` +
      `(${error.message}). Please delete ${paths.join(", ")} from the ` +
      `${ABOUT_IMAGE_BUCKET} bucket in Supabase Storage.`
    );
  }

  log(req, "image.delete", true, { paths });
  return "";
}
