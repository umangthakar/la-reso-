// ============================================================
// Admin API — WhatsApp "Send Test Message"
// Service-role, password-gated. Sends a fixed sample text message to the
// configured Owner WhatsApp Number and records the outcome in
// whatsapp_status.
//
// Free-form text only delivers inside Meta's 24-hour customer service
// window; outside it the send is rejected and Meta's verbatim error is
// returned to the admin.
// ============================================================

import { NextResponse } from "next/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { sendTestMessage, getAdminWhatsAppState } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const result = await sendTestMessage();
    const config = await getAdminWhatsAppState();
    return NextResponse.json({ ok: result.ok, result, config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Send failed" },
      { status: 500 },
    );
  }
}
