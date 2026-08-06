// ============================================================
// Le Rasa — reusable transactional email service (Resend).
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
import { emailFrom, normaliseEmailFrom } from "@/lib/email-brand";

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

/**
 * The verified "From" address. EMAIL_FROM overrides the default; the default
 * carries the shared brand name, because the sender line is the first piece of
 * branding a customer reads.
 *
 * Run through normaliseEmailFrom() so a deployment whose EMAIL_FROM still says
 * "Le Rasa Bakery" sends as "Le Rasa" anyway — the sender line is read before
 * the email is even opened, so it must obey the same brand rule as the body.
 * The address inside the angle brackets is never altered.
 */
function fromAddress(): string {
  return (
    normaliseEmailFrom(process.env.EMAIL_FROM) || emailFrom("onboarding@resend.dev")
  );
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

  // No per-send diagnostics here: this ran on every email and printed the
  // recipient's address (and the configured owner/from addresses) into the
  // server log. Misconfiguration and failures are still reported below via
  // console.error, which is where an operator actually needs to look.
  if (!key) {
    console.error("Resend Error: RESEND_API_KEY missing — no request will be sent to Resend.");
    return { ok: false, error: "email not configured: RESEND_API_KEY missing" };
  }
  if (!to) {
    console.error("Resend Error: recipient (to) is empty — no request will be sent to Resend.");
    return { ok: false, error: "email not configured: recipient missing" };
  }

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

    const detail = await res.text().catch(() => "");
    if (!res.ok) {
      // Never silently fail — log the full context Resend returned.
      console.error("Resend Error", {
        statusCode: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        body: detail,
      });
      return { ok: false, error: `Resend ${res.status}: ${detail.slice(0, 200)}` };
    }

    return { ok: true };
  } catch (e) {
    console.error("Resend Error (network/exception)", e);
    return { ok: false, error: e instanceof Error ? e.message : "email failed" };
  }
}
