// ============================================================
// Admin API — WhatsApp "Test Connection"
// Service-role, password-gated. Verifies the stored Access Token, Phone
// Number ID, WhatsApp Business Account and messaging permission against the
// Meta Graph API, and records the outcome in whatsapp_status.
//
// Sends no message — see ../test-message for that.
// ============================================================

import { NextResponse } from "next/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { testConnection, getAdminWhatsAppState } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const result = await testConnection();
    const config = await getAdminWhatsAppState();
    return NextResponse.json({ ok: result.ok, result, config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Test failed" },
      { status: 500 },
    );
  }
}
