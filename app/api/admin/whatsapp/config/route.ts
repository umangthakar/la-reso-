// ============================================================
// Admin API — WhatsApp configuration (GET masked + PUT save)
// Service-role, password-gated. Stored on the site_settings row under
// `whatsapp_config`. The App Secret, Access Token and Webhook Verify Token
// are encrypted at rest (lib/crypto) and NEVER returned to the browser —
// GET only reports whether each is set, plus its last 4, and the latest
// test status.
//
// Requires the columns from supabase/sql/25_whatsapp.sql.
// ============================================================

import { NextResponse } from "next/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import {
  getAdminWhatsAppState,
  saveAdminWhatsAppConfig,
  ValidationError,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const config = await getAdminWhatsAppState();
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Failed to load WhatsApp settings",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const config = await saveAdminWhatsAppConfig({
      enabled: Boolean(body.enabled),
      app_id: String(body.app_id ?? ""),
      phone_number_id: String(body.phone_number_id ?? ""),
      waba_id: String(body.waba_id ?? ""),
      business_number: String(body.business_number ?? ""),
      owner_number: String(body.owner_number ?? ""),
      api_version: String(body.api_version ?? ""),
      // Blank = keep the existing stored secret.
      app_secret: String(body.app_secret ?? ""),
      access_token: String(body.access_token ?? ""),
      verify_token: String(body.verify_token ?? ""),
    });
    return NextResponse.json({ config });
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json(
        { error: e.message, fields: e.fields },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Failed to save WhatsApp settings",
      },
      { status: 500 },
    );
  }
}
