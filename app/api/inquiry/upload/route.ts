// ============================================================
// Le Rasa Bakery — public reference-image upload for the Custom Cake
// Inquiry form.
// ------------------------------------------------------------
// The inquiry is sent to the owner over WhatsApp (no order, no checkout, no
// email), so uploaded reference photos must live at a PUBLIC URL the owner can
// open straight from the chat. This uploads to the already-public
// "product-images" bucket under an `inquiry/` prefix and returns the URL.
//
// Public (no admin auth) by necessity, so abuse protection is the whole story
// here. Three layers:
//
//   1. RATE LIMIT — a per-IP quota on ACCEPTED uploads (lib/rate-limit
//      #consumeQuota). Without it this endpoint is unmetered write access to
//      the bakery's storage: an unauthenticated caller could loop 8 MB uploads
//      indefinitely and run up the bill.
//   2. CONTENT VALIDATION — size cap, MIME allowlist AND magic-byte sniffing
//      (lib/upload-validation). The client's Content-Type is not trusted; a
//      .html renamed to .png is rejected on its bytes.
//   3. SAFE NAMING — the stored name is generated and the extension comes from
//      the sniffed type, so the uploaded filename never reaches storage.
//
// The inquiry workflow itself is unchanged: same request shape, same response
// ({ url }), same bucket and `inquiry/` prefix.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { clientKey, consumeQuota } from "@/lib/rate-limit";
import { safeObjectPath, validateImageUpload } from "@/lib/upload-validation";

export const dynamic = "force-dynamic";

const BUCKET = "product-images";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per image (unchanged)

/** Accepted uploads per IP per window. A genuine inquiry sends a handful of
 *  reference photos, so 12 per 10 minutes is generous for that and useless
 *  for bulk abuse. */
const QUOTA = { max: 12, windowMs: 10 * 60 * 1000 };

export async function POST(req: Request) {
  const quota = consumeQuota(`inquiry-upload:${clientKey(req)}`, QUOTA);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(quota.retryAfterSeconds) } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "The upload was interrupted." }, { status: 400 });
  }

  const validated = await validateImageUpload(form.get("file"), { maxBytes: MAX_BYTES });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }
  const { bytes, contentType, ext } = validated.file;

  const supabase = createAdminClient();
  const path = safeObjectPath(ext, "inquiry");

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { cacheControl: "3600", upsert: false, contentType });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
