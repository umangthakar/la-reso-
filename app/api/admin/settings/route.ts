// ============================================================
// Admin API — site settings (GET single row + PUT partial update)
// Service-role, password-gated. site_settings is a singleton row.
//
// PUT does a WHITELISTED PARTIAL update: only the recognised keys that
// are actually present in the request body are written, so a page can
// save just its own section without clobbering the others (e.g. the
// Themes page only sends active_theme, the Content page only sends its
// fields). New content columns come from supabase/sql/07_content_settings.sql.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Columns the admin may write. Anything else in the body is ignored.
const WRITABLE = [
  "site_name",
  "tagline",
  "logo",
  "contact",
  "phone",
  "email",
  "address",
  "active_theme",
  "whatsapp",
  "announcement",
  "hero_banner",
  "rotating_banners",
  "home_slider",
  "whatsapp_bar",
  "instagram_url",
  "facebook_url",
  "tiktok_url",
  "hero_tagline",
  "hero_button_text",
  "hero_image_url",
  "about_story",
  "about_image_url",
] as const;

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const supabase = adminDb();
  const { data, error } = await supabase
    .from("site_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

export async function PUT(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const body = (await req.json()) as Record<string, unknown>;
  const supabase = adminDb();

  // Build the update from only the recognised keys present in the body.
  const fields: Record<string, unknown> = {};
  for (const key of WRITABLE) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      fields[key] = body[key];
    }
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "No recognised settings to update." }, { status: 400 });
  }

  // Find the existing singleton row, if any.
  const existing = await supabase.from("site_settings").select("id").limit(1).maybeSingle();
  if (existing.error) {
    return NextResponse.json({ error: existing.error.message }, { status: 500 });
  }

  const result = existing.data?.id
    ? await supabase.from("site_settings").update(fields).eq("id", existing.data.id).select().single()
    : await supabase.from("site_settings").insert(fields).select().single();

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ settings: result.data });
}
