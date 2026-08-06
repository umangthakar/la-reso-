// ============================================================
// Le Rasa Bakery — order notifications (credentials + sending)
// ------------------------------------------------------------
// This file owns the CREDENTIALS and the NETWORK for the two providers the
// bakery notifies through: Resend (email) and the Meta WhatsApp Cloud API.
//
// WHO SENDS WHAT.
//   * the OWNER's messages — a new order, an inquiry, a lifecycle change —
//     are built and sent here (WhatsApp), with the words in
//     lib/notification-content.ts.
//   * the CUSTOMER's order emails are NOT built here. All four of them
//     (placed / accepted / cancelled / refunded) belong to lib/order-email.ts,
//     which owns their templates AND the duplicate protection that guarantees
//     each one reaches the customer exactly once. It sends through
//     sendConfiguredEmail() below, so there is still only ONE Resend
//     integration and one From address — the split is who composes the
//     message, not who talks to the provider.
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
import { normaliseEmailFrom } from "@/lib/email-brand";
import {
  buildWhatsAppText,
  buildEventWhatsApp,
  type NotifyOrder,
  type LifecycleEvent,
  type LifecycleOrder,
} from "@/lib/notification-content";

export type { NotifyItem, NotifyOrder } from "@/lib/notification-content";
export type { LifecycleEvent, LifecycleOrder } from "@/lib/notification-content";

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

/** The result of one send attempt through either provider. */
export type SendStatus = { status: "sent" | "skipped" | "failed"; error?: string };

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

// ------------------------------------------------------------
// Low-level transport primitives. Each swallows its own failures and
// reports them as a value — an unconfigured provider or an outage must
// never throw. Shared by the order-placed notifications AND the
// lifecycle (accepted / cancelled / refunded) notifications below.
// ------------------------------------------------------------

/** Send one email via Resend. Skips silently when unconfigured. */
async function postEmail(
  config: NotificationConfig,
  to: string,
  subject: string,
  html: string,
): Promise<SendStatus> {
  const key = secret(config.resend_key_enc);
  const from = (config.from_email ?? "").trim();
  if (!key || !from || !to) return { status: "skipped" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // `from_name` is admin-entered, so it is normalised through the shared
        // brand rule rather than trusted verbatim — otherwise a settings row
        // still holding "Le Rasa Bakery" would put the retired name on the
        // sender line of every notification. The address is left untouched.
        from: config.from_name
          ? normaliseEmailFrom(`${config.from_name} <${from}>`)
          : from,
        to: [to],
        subject,
        html,
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

/** Send one WhatsApp text to the owner. Skips silently when unconfigured. */
async function postOwnerWhatsApp(
  config: NotificationConfig,
  body: string,
): Promise<SendStatus> {
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
          text: { preview_url: false, body },
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
 * Send one email through the ADMIN-CONFIGURED Resend credentials.
 *
 * Exported so lib/order-email can reuse this exact transport — the same key,
 * the same From address, the same failure handling the owner's notifications
 * already use — instead of standing up a second Resend client. It only ever
 * reports a value: 'skipped' when the admin hasn't configured Resend (the
 * caller then falls back to the env-var client in lib/email), 'failed' with
 * the provider's own message when the request was made and rejected.
 */
export async function sendConfiguredEmail(
  supabase: SupabaseClient,
  to: string,
  subject: string,
  html: string,
): Promise<SendStatus> {
  let config: NotificationConfig;
  try {
    config = await loadNotificationConfig(supabase);
  } catch (e) {
    return {
      status: "failed",
      error: e instanceof Error ? e.message : "could not read notification config",
    };
  }
  return postEmail(config, to, subject, html);
}

/**
 * Tell the OWNER a new order came in (WhatsApp).
 *
 * The customer's confirmation email is sent separately by
 * lib/order-email.sendOrderPlacedEmail, which owns its template and its
 * duplicate protection — this function deliberately does NOT email anyone, so
 * a customer can never receive two confirmations for one order.
 *
 * NEVER throws and never rejects: the caller has already taken the customer's
 * money and saved the order, so an undelivered message is a log line, not an
 * error the customer should see.
 */
export async function notifyOwnerNewOrder(
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

  const whatsapp = await postOwnerWhatsApp(config, buildWhatsAppText(order));
  result.whatsapp = whatsapp.status;
  if (whatsapp.error) result.errors.push(whatsapp.error);
  return result;
}

// ------------------------------------------------------------
// Custom Cake Inquiry — owner notification (email + WhatsApp).
// A submitted inquiry is NOT an order (no payment, no checkout); this simply
// alerts the owner that one arrived, carrying its Inquiry Number. Best-effort
// like everything else here: a failed send never blocks the inquiry.
// ------------------------------------------------------------

export type InquiryNotice = {
  inquiryNumber: string;
  name: string;
  phone: string;
  email: string;
  eventType: string;
  deliveryDate: string;
  servings: string;
  budget: string;
  flavour: string;
  shape: string;
  colourTheme: string;
  cakeMessage: string;
  notes: string;
  images: string[];
};

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

function inquiryRows(n: InquiryNotice): [string, string][] {
  return [
    ["Customer Name", n.name],
    ["Phone", n.phone],
    ["Email", n.email],
    ["Event Type", n.eventType],
    ["Delivery Date", n.deliveryDate],
    ["Servings", n.servings],
    ["Budget", n.budget],
    ["Flavour", n.flavour],
    ["Shape", n.shape],
    ["Colour Theme", n.colourTheme],
    ["Cake Message", n.cakeMessage],
    ["Additional Notes", n.notes],
  ].filter(([, v]) => v.trim()) as [string, string][];
}

function buildInquiryEmail(n: InquiryNotice): string {
  const rows = inquiryRows(n)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;color:#873853;font-weight:600;white-space:nowrap">${esc(k)}</td><td style="padding:6px 12px;color:#3a1622">${esc(v)}</td></tr>`,
    )
    .join("");
  const images = n.images.length
    ? `<p style="margin:16px 0 6px;color:#873853;font-weight:600">Reference images</p>` +
      n.images
        .map((u) => `<a href="${esc(u)}" style="color:#873853">${esc(u)}</a><br/>`)
        .join("")
    : "";
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:auto">
      <h2 style="color:#873853">New Custom Cake Inquiry</h2>
      <p style="font-size:18px;font-weight:700;color:#5C2A41">Inquiry ${esc(n.inquiryNumber)}</p>
      <table style="border-collapse:collapse;width:100%">${rows}</table>
      ${images}
    </div>`;
}

function buildInquiryWhatsApp(n: InquiryNotice): string {
  const lines = [`🎂 New Custom Cake Inquiry`, `Ref: ${n.inquiryNumber}`, ""];
  for (const [k, v] of inquiryRows(n)) lines.push(`${k}: ${v}`);
  if (n.images.length) {
    lines.push("", "Reference Images:");
    for (const u of n.images) lines.push(u);
  }
  return lines.join("\n");
}

/**
 * Alert the owner about a new inquiry. `ownerEmail` is the bakery's own
 * address (settings.contact.email, falling back to the Resend from address).
 * NEVER throws — a failed send is a log line, not an error the customer sees.
 */
export async function notifyInquiry(
  supabase: SupabaseClient,
  ownerEmail: string,
  inquiry: InquiryNotice,
): Promise<NotifyResult> {
  const result: NotifyResult = { email: "skipped", whatsapp: "skipped", errors: [] };

  let config: NotificationConfig;
  try {
    config = await loadNotificationConfig(supabase);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : "could not read config");
    return result;
  }

  const to = (ownerEmail || config.from_email || "").trim();
  const [email, whatsapp] = await Promise.all([
    postEmail(config, to, `New Custom Cake Inquiry ${inquiry.inquiryNumber}`, buildInquiryEmail(inquiry)),
    postOwnerWhatsApp(config, buildInquiryWhatsApp(inquiry)),
  ]);

  result.email = email.status;
  result.whatsapp = whatsapp.status;
  if (email.error) result.errors.push(email.error);
  if (whatsapp.error) result.errors.push(whatsapp.error);
  return result;
}

/**
 * Tell the OWNER about a lifecycle change (cancelled, auto-cancelled, or a
 * refund that completed on retry). An "accepted" event is the owner's own
 * action, so it produces no owner ping.
 *
 * As with notifyOwnerNewOrder, the CUSTOMER's side of each of these events is
 * sent by lib/order-email (sendOrderAcceptedEmail / sendOrderCancelledEmail /
 * sendOrderRefundedEmail), which is the only place a customer order email is
 * ever composed. NEVER throws — a failed send is a log line.
 */
export async function notifyOwnerLifecycle(
  supabase: SupabaseClient,
  event: LifecycleEvent,
  order: LifecycleOrder,
): Promise<NotifyResult> {
  const result: NotifyResult = { email: "skipped", whatsapp: "skipped", errors: [] };
  if (event === "accepted") return result;

  let config: NotificationConfig;
  try {
    config = await loadNotificationConfig(supabase);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : "could not read config");
    return result;
  }

  const whatsapp = await postOwnerWhatsApp(config, buildEventWhatsApp(event, order));
  result.whatsapp = whatsapp.status;
  if (whatsapp.error) result.errors.push(whatsapp.error);
  return result;
}
