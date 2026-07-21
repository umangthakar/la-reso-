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

  // Diagnostic: surface exactly what the server has loaded at send time.
  console.log("EMAIL CONFIG", {
    resend: !!process.env.RESEND_API_KEY,
    owner: process.env.OWNER_EMAIL,
    from: process.env.EMAIL_FROM,
  });
  console.log("EMAIL from address", fromAddress());
  console.log("EMAIL to (recipient)", to || "(empty)");

  if (!key) {
    console.error("Resend Error: RESEND_API_KEY missing — no request will be sent to Resend.");
    return { ok: false, error: "email not configured: RESEND_API_KEY missing" };
  }
  if (!to) {
    console.error("Resend Error: recipient (to) is empty — no request will be sent to Resend.");
    return { ok: false, error: "email not configured: recipient missing" };
  }

  try {
    console.log("EMAIL sending request to Resend...", { subject: input.subject });
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

    console.log("Resend response:", detail || "(empty body)");
    console.log("Email sent successfully.");
    return { ok: true };
  } catch (e) {
    console.error("Resend Error (network/exception)", e);
    return { ok: false, error: e instanceof Error ? e.message : "email failed" };
  }
}
