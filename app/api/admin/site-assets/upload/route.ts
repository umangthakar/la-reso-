// ============================================================
// Admin API — image upload to the "site-assets" storage bucket
// Service-role, password-gated. Used for hero / about page images on
// the Content & Settings page, the offer banner / hero / popup images, and
// policy images. Returns the public URL. Creates the bucket on first use
// (idempotent — ignores "already exists").
//
// A caller may send `maxBytes` and/or `accept` to hold itself to a TIGHTER
// policy than the default — the offer popup background asks for 5 MB and
// JPEG/PNG/WebP. Both are clamped inside validateImageUpload(), so a forged
// request can only ever narrow what is accepted, never widen it. Callers that
// send neither get exactly the behaviour they always had.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { safeObjectPath, validateImageUpload } from "@/lib/upload-validation";

export const dynamic = "force-dynamic";

const BUCKET = "site-assets";

/** A positive integer from a form field, or undefined when absent/invalid. */
function optionalCount(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function POST(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const form = await req.formData();
  const accept = form.get("accept");
  // Validated by content, not by the client's Content-Type — this bucket is
  // public, so an unvalidated upload is arbitrary hosting. See
  // lib/upload-validation.
  const validated = await validateImageUpload(form.get("file"), {
    maxBytes: optionalCount(form.get("maxBytes")),
    allowedTypes: typeof accept === "string" ? accept.split(",").map((t) => t.trim()) : undefined,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }
  const { bytes, contentType, ext } = validated.file;

  const supabase = createAdminClient();

  // Ensure the public bucket exists. A duplicate error just means it's
  // already there, which is fine.
  const created = await supabase.storage.createBucket(BUCKET, { public: true });
  if (created.error && !/exist/i.test(created.error.message)) {
    return NextResponse.json({ error: created.error.message }, { status: 500 });
  }

  const path = safeObjectPath(ext);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { cacheControl: "3600", upsert: false, contentType });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
