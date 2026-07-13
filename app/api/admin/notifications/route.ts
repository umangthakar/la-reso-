// ============================================================
// Admin API — order notification settings (GET masked + PUT save)
// Service-role, password-gated. Stored on the single site_settings row under
// `notification_config` (supabase/sql/22_accessories.sql).
//
// The Resend API key and the WhatsApp token are SECRETS: encrypted at rest
// (lib/crypto) and NEVER returned to the browser. GET only reports whether
// each one is set, plus its last 4 characters — the same posture as
// /api/admin/payments/stripe-config.
//
// Leaving a secret field blank on save KEEPS the stored one, so an admin can
// change the "from" address without re-typing their API key.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import type { NotificationConfig } from "@/lib/notifications";

export const dynamic = "force-dynamic";

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

async function loadRow(
  supabase: SupabaseClient,
): Promise<{ id: string | null; config: NotificationConfig }> {
  // Whole row, not a targeted select: PostgREST's schema cache can lag a
  // freshly-added column and reject `select('notification_config')`.
  const { data, error } = await supabase
    .from("site_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { id?: string; notification_config?: NotificationConfig } | null;
  return { id: row?.id ?? null, config: row?.notification_config ?? {} };
}

function last4(enc?: string): string {
  if (!enc) return "";
  try {
    return decryptSecret(enc).slice(-4);
  } catch {
    return "";
  }
}

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const { config } = await loadRow(adminDb());
    return NextResponse.json({
      config: {
        from_email: config.from_email ?? "",
        from_name: config.from_name ?? "",
        whatsapp_phone_id: config.whatsapp_phone_id ?? "",
        owner_phone: config.owner_phone ?? "",
        has_resend_key: Boolean(config.resend_key_enc),
        resend_key_last4: last4(config.resend_key_enc),
        has_whatsapp_token: Boolean(config.whatsapp_token_enc),
        whatsapp_token_last4: last4(config.whatsapp_token_enc),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load notification settings" },
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
    const supabase = adminDb();
    const { id, config: existing } = await loadRow(supabase);

    // Blank secret = keep whatever is already stored.
    const incomingResend = String(body.resend_key ?? "").trim();
    const incomingToken = String(body.whatsapp_token ?? "").trim();

    const notification_config: NotificationConfig = {
      from_email: String(body.from_email ?? "").trim(),
      from_name: String(body.from_name ?? "").trim(),
      whatsapp_phone_id: String(body.whatsapp_phone_id ?? "").trim(),
      // Digits only — the Cloud API rejects "+44 (0)7700…".
      owner_phone: String(body.owner_phone ?? "").replace(/[^\d]/g, ""),
      ...(incomingResend
        ? { resend_key_enc: encryptSecret(incomingResend) }
        : existing.resend_key_enc
          ? { resend_key_enc: existing.resend_key_enc }
          : {}),
      ...(incomingToken
        ? { whatsapp_token_enc: encryptSecret(incomingToken) }
        : existing.whatsapp_token_enc
          ? { whatsapp_token_enc: existing.whatsapp_token_enc }
          : {}),
    };

    const result = id
      ? await supabase
          .from("site_settings")
          .update({ notification_config })
          .eq("id", id)
          .select("id")
          .single()
      : await supabase
          .from("site_settings")
          .insert({ notification_config })
          .select("id")
          .single();

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save notification settings" },
      { status: 500 },
    );
  }
}
