// ============================================================
// Admin API — image upload to the "product-images" storage bucket
// Service-role, session-gated. Returns the public URL.
//
// The bucket is PUBLIC, so what lands in it is served from the project's
// supabase.co domain. Every upload is therefore validated by content, not by
// what the client claims: see lib/upload-validation (size cap, MIME allowlist
// and magic-byte sniffing). The stored extension and contentType come from the
// sniffed type, so a renamed .html can neither be stored nor served as markup.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { PRODUCT_IMAGE_BUCKET as BUCKET } from "@/lib/product-storage";
import { safeObjectPath, validateImageUpload } from "@/lib/upload-validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const form = await req.formData();
  const validated = await validateImageUpload(form.get("file"));
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }
  const { bytes, contentType, ext } = validated.file;

  const supabase = createAdminClient();
  const path = safeObjectPath(ext);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { cacheControl: "3600", upsert: false, contentType });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
