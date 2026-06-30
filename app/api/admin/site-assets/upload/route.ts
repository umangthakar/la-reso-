// ============================================================
// Admin API — image upload to the "site-assets" storage bucket
// Service-role, password-gated. Used for hero / about page images on
// the Content & Settings page. Returns the public URL. Creates the
// bucket on first use (idempotent — ignores "already exists").
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const BUCKET = "site-assets";

export async function POST(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Ensure the public bucket exists. A duplicate error just means it's
  // already there, which is fine.
  const created = await supabase.storage.createBucket(BUCKET, { public: true });
  if (created.error && !/exist/i.test(created.error.message)) {
    return NextResponse.json({ error: created.error.message }, { status: 500 });
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
