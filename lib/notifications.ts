// ============================================================
// Le Rasa Bakery — order notifications (credentials + sending)
// ------------------------------------------------------------
// Two messages go out the moment an order is saved:
//
//   * the CUSTOMER gets an email (Resend)
//   * the OWNER gets a WhatsApp message (Meta WhatsApp Cloud API)
//
// Both carry the cake, its accessories, every message and note, the
// quantities and the total. The WORDS live in lib/notification-content.ts;
// this file owns the credentials and the network.
//
// Both are called over plain HTTPS — no SDK, no new dependency. Credentials
// live on the single site_settings row under `notification_config`, set from
// the admin panel, with secrets encrypted at rest (lib/crypto), exactly like
// `stripe_config`.
//
// THE ORDER IS ALWAYS SAFE. Every function here swallows its own failures and
// reports them as a value: an unconfigured provider, a revoked token or a
// WhatsApp outage must never fail a payment the customer has already made.
// Callers fire this AFTER the order row is written and ignore the result.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto";
import { buildEmailHtml, buildWhatsAppText, type NotifyOrder } from "@/lib/notification-content";

export type { NotifyItem, NotifyOrder } from "@/lib/notification-content";

export type NotificationConfig = {
  /** Resend */
  resend_key_enc?: string;
  from_email?: string;
  from_name?: string;
  /** Meta WhatsApp Cloud API */
  whatsapp_token_enc?: string;
  whatsapp_phone_id?: string;
  /** Where the owner's notification goes, e.g. 447700900123 */
  owner_phone?: string;
};

export type NotifyResult = {
  email: "sent" | "skipped" | "failed";
  whatsapp: "sent" | "skipped" | "failed";
  errors: string[];
};

export async function loadNotificationConfig(
  supabase: SupabaseClient,
): Promise<NotificationConfig> {
  // Select the whole row, not the column: PostgREST's schema cache can lag a
  // freshly-added column and reject a targeted select. (Same reason as
  // /api/admin/payments/stripe-config.)
  const { data } = await supabase
    .from("site_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  const row = data as { notification_config?: NotificationConfig } | null;
  return row?.notification_config ?? {};
}

/** Decrypt a stored secret, treating anything unreadable as "not set". */
function secret(enc: string | undefined): string {
  if (!enc) return "";
  try {
    return decryptSecret(enc);
  } catch {
    return "";
  }
}

async function sendCustomerEmail(
  config: NotificationConfig,
  order: NotifyOrder,
): Promise<{ status: "sent" | "skipped" | "failed"; error?: string }> {
  const key = secret(config.resend_key_enc);
  const from = (config.from_email ?? "").trim();
  if (!key || !from || !order.email) return { status: "skipped" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from_name ? `${config.from_name} <${from}>` : from,
        to: [order.email],
        subject: `Your Le Rasa order ${order.orderNumber}`,
        html: buildEmailHtml(order),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { status: "failed", error: `Resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : "email failed" };
  }
}

async function sendOwnerWhatsApp(
  config: NotificationConfig,
  order: NotifyOrder,
): Promise<{ status: "sent" | "skipped" | "failed"; error?: string }> {
  const token = secret(config.whatsapp_token_enc);
  const phoneId = (config.whatsapp_phone_id ?? "").trim();
  const to = (config.owner_phone ?? "").replace(/[^\d]/g, "");
  if (!token || !phoneId || !to) return { status: "skipped" };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { preview_url: false, body: buildWhatsAppText(order) },
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { status: "failed", error: `WhatsApp ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : "whatsapp failed" };
  }
}

/**
 * Fire both notifications. NEVER throws and never rejects — the caller has
 * already taken the customer's money and saved the order; a message that
 * couldn't be delivered is a log line, not an error the customer should see.
 */
export async function notifyOrder(
  supabase: SupabaseClient,
  order: NotifyOrder,
): Promise<NotifyResult> {
  const result: NotifyResult = { email: "skipped", whatsapp: "skipped", errors: [] };

  let config: NotificationConfig;
  try {
    config = await loadNotificationConfig(supabase);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : "could not read config");
    return result;
  }

  const [email, whatsapp] = await Promise.all([
    sendCustomerEmail(config, order),
    sendOwnerWhatsApp(config, order),
  ]);

  result.email = email.status;
  result.whatsapp = whatsapp.status;
  if (email.error) result.errors.push(email.error);
  if (whatsapp.error) result.errors.push(whatsapp.error);
  return result;
}
