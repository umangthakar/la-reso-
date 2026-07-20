// ============================================================
// Le Rasa Bakery — reusable transactional email service (Resend).
// ------------------------------------------------------------
// A tiny, dependency-free wrapper around the Resend HTTP API, driven by
// environment variables so it works without any admin configuration:
//
//   RESEND_API_KEY   — Resend API key (required to actually send)
//   OWNER_EMAIL      — where owner notifications go
//   OWNER_WHATSAPP   — the bakery's WhatsApp number (available to callers)
//   EMAIL_FROM       — verified "From" address (optional; sensible default)
//
// Every send is BEST-EFFORT and reported as a value — a missing key or a
// Resend outage returns { ok:false }, it never throws, so a customer action
// (e.g. submitting an inquiry) is never blocked by email delivery.
//
// Server-only: never import from a "use client" module.
// ============================================================

import "server-only";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** True when a Resend key is present (so a send can be attempted). */
export function isEmailConfigured(): boolean {
  return Boolean((process.env.RESEND_API_KEY ?? "").trim());
}

/** The owner notification recipient (OWNER_EMAIL). */
export function ownerEmail(): string {
  return (process.env.OWNER_EMAIL ?? "").trim();
}

/** The bakery's WhatsApp number, digits only (OWNER_WHATSAPP). */
export function ownerWhatsApp(): string {
  return (process.env.OWNER_WHATSAPP ?? "").replace(/[^\d]/g, "");
}

/** The verified "From" address. EMAIL_FROM overrides the default. */
function fromAddress(): string {
  return (process.env.EMAIL_FROM ?? "").trim() || "Le Rasa Bakery <onboarding@resend.dev>";
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  /** Optional Reply-To (e.g. the customer's email). */
  replyTo?: string;
};

export type SendEmailResult = { ok: boolean; error?: string };

/** Send one HTML email via Resend. Never throws. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = (process.env.RESEND_API_KEY ?? "").trim();
  const to = (input.to ?? "").trim();
  if (!key || !to) return { ok: false, error: "email not configured" };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [to],
        subject: input.subject,
        html: input.html,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "email failed" };
  }
}
