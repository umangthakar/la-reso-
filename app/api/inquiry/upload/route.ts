// ============================================================
// Le Rasa Bakery — public reference-image upload for the Custom Cake
// Inquiry form.
// ------------------------------------------------------------
// The inquiry is sent to the owner over WhatsApp (no order, no checkout, no
// email), so uploaded reference photos must live at a PUBLIC URL the owner can
// open straight from the chat. This uploads to the already-public
// "product-images" bucket under an `inquiry/` prefix and returns the URL.
//
// Public (no admin auth) by necessity — guarded by image-only content types
// and a per-file size cap so it can't be abused as arbitrary storage.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BUCKET = "product-images";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per image
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!file.type.startsWith("image/") || (file.type && !ALLOWED.includes(file.type))) {
    return NextResponse.json({ error: "Only image files are allowed." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Each image must be under 8 MB." }, { status: 413 });
  }

  const supabase = createAdminClient();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const path = `inquiry/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
