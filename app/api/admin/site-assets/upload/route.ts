// ============================================================
// Admin API — image upload to the "site-assets" storage bucket
// Service-role, password-gated. Used for hero / about page images on
// the Content & Settings page. Returns the public URL. Creates the
// bucket on first use (idempotent — ignores "already exists").
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { safeObjectPath, validateImageUpload } from "@/lib/upload-validation";

export const dynamic = "force-dynamic";

const BUCKET = "site-assets";

export async function POST(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const form = await req.formData();
  // Validated by content, not by the client's Content-Type — this bucket is
  // public, so an unvalidated upload is arbitrary hosting. See
  // lib/upload-validation.
  const validated = await validateImageUpload(form.get("file"));
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
