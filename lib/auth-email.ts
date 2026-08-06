// ============================================================
// Le Rasa — Auth Email module
// ------------------------------------------------------------
// Reusable service for the four transactional AUTH emails, sent by the
// /api/auth/* routes and the verify page:
//
//   sendVerificationEmail()      — confirm a new email address
//   sendForgotPasswordEmail()    — password reset link
//   sendWelcomeEmail()           — post-verification greeting
//   sendPasswordChangedEmail()   — security confirmation
//
// It reuses the existing, proven Resend wrapper (lib/email.ts) so there is a
// single Resend integration point, plus:
//   • centralized configuration      (getAuthEmailConfig)
//   • environment validation          (validateAuthEmailEnv)
//   • structured logging              ([auth-email] prefixed)
//
// BRAND + LINKS come from lib/email-brand — the same source the order and
// inquiry emails use. Every URL handed to a template is ABSOLUTE; a bare path
// is unusable in an inbox.
//
// Server-only: never import from a "use client" module.
// ============================================================

import "server-only";
import { sendEmail, type SendEmailResult } from "@/lib/email";
import {
  EMAIL_BRAND,
  emailAccountUrl,
  emailBrandText,
  emailFrom,
  emailSiteUrl,
  emailUrl,
  isEmailHref,
} from "@/lib/email-brand";
import {
  buildVerificationEmail,
  buildForgotPasswordEmail,
  buildWelcomeEmail,
  buildPasswordChangedEmail,
} from "@/lib/auth-email-templates";

// ── Centralized configuration ────────────────────────────────

export type AuthEmailConfig = {
  /** "From" address for auth emails. AUTH_EMAIL_FROM overrides EMAIL_FROM. */
  from: string;
  /** Optional Reply-To (AUTH_EMAIL_REPLY_TO). */
  replyTo?: string;
  /** Brand name shown in templates. */
  brandName: string;
  /** The line under the wordmark. */
  tagline: string;
  /** Support address surfaced in templates (falls back to Reply-To). */
  supportEmail?: string;
  /** Absolute site origin (no trailing slash) for building links. */
  siteUrl: string;
};

const DEFAULT_FROM = emailFrom("onboarding@resend.dev");

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Resolve the auth-email configuration from the environment. Pure read — never
 * throws, so importing this module can't break a build. Precedence:
 *   from       ← AUTH_EMAIL_FROM → EMAIL_FROM → hardcoded resend.dev default
 *   siteUrl    ← lib/email-brand.emailSiteUrl() — always absolute, never a
 *                loopback host, so no link in an inbox can be unreachable
 *   brand      ← NEXT_PUBLIC_BRAND_NAME → EMAIL_BRAND (the shared source)
 */
export function getAuthEmailConfig(): AuthEmailConfig {
  const from = env("AUTH_EMAIL_FROM") || env("EMAIL_FROM") || DEFAULT_FROM;
  const replyTo = env("AUTH_EMAIL_REPLY_TO") || undefined;
  // Customer-facing: AUTH_SUPPORT_EMAIL is the deliberate override, then the
  // Reply-To we already ask customers to write to, then the shared brand
  // address. OWNER_EMAIL is deliberately NOT in this chain — it is the owner's
  // internal notification inbox, and it must never be printed to a customer.
  const supportEmail =
    env("AUTH_SUPPORT_EMAIL") || replyTo || EMAIL_BRAND.supportEmail;
  const brandName = emailBrandText(env("NEXT_PUBLIC_BRAND_NAME")) || EMAIL_BRAND.name;
  return {
    from,
    replyTo,
    brandName,
    tagline: EMAIL_BRAND.tagline,
    supportEmail,
    siteUrl: emailSiteUrl(),
  };
}

// ── Environment validation ───────────────────────────────────

export type AuthEmailEnvReport = {
  /** True when the module can actually send (RESEND_API_KEY + a From present). */
  ok: boolean;
  /** Hard requirements that are missing. */
  missing: string[];
  /** Non-fatal recommendations (defaults will be used). */
  warnings: string[];
};

/**
 * Validate the environment this module depends on. Non-throwing: returns a
 * structured report so callers (or a future health check) can decide what to
 * do. Logs a single structured line so misconfig is visible in server logs.
 */
export function validateAuthEmailEnv(): AuthEmailEnvReport {
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!env("RESEND_API_KEY")) missing.push("RESEND_API_KEY");

  if (!env("AUTH_EMAIL_FROM") && !env("EMAIL_FROM")) {
    warnings.push("AUTH_EMAIL_FROM/EMAIL_FROM unset — falling back to onboarding@resend.dev (test sender)");
  }
  if (!env("NEXT_PUBLIC_SITE_URL") && !env("SITE_URL")) {
    warnings.push(
      `NEXT_PUBLIC_SITE_URL/SITE_URL unset — email links fall back to ${EMAIL_BRAND.website}`,
    );
  }
  if (!env("AUTH_SUPPORT_EMAIL")) {
    warnings.push(
      `AUTH_SUPPORT_EMAIL unset — emails show ${EMAIL_BRAND.supportEmail}`,
    );
  }

  const ok = missing.length === 0;
  log("env.validate", { ok, missing, warnings });
  return { ok, missing, warnings };
}

// ── Structured logging ───────────────────────────────────────

type LogData = Record<string, unknown>;

/**
 * One structured, prefixed log line per auth-email event.
 *
 * Development only: these carry the recipient's email address and fire on
 * every signup / reset / verification, which is noise (and PII) in a
 * production log. Failures are unaffected — they go through `logError`.
 */
function log(event: string, data: LogData): void {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.log("[auth-email]", event, data);
}

function logError(event: string, data: LogData): void {
  // eslint-disable-next-line no-console
  console.error("[auth-email]", event, data);
}

// ── Send helpers ─────────────────────────────────────────────

/** Mask an email for logs: "ja***@example.com". */
function maskEmail(to: string): string {
  const [user, domain] = to.split("@");
  if (!domain) return "***";
  const head = user.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

/**
 * Shared send path: validate env, dispatch via the proven Resend wrapper, and
 * emit before/after structured logs. Best-effort like the rest of the system —
 * returns { ok:false } instead of throwing.
 */
async function dispatch(
  kind: string,
  to: string,
  subject: string,
  html: string,
): Promise<SendEmailResult> {
  const cfg = getAuthEmailConfig();
  const recipient = (to ?? "").trim();

  if (!recipient) {
    logError("send.skip", { kind, reason: "empty recipient" });
    return { ok: false, error: "recipient missing" };
  }

  const report = validateAuthEmailEnv();
  if (!report.ok) {
    logError("send.skip", { kind, reason: "env invalid", missing: report.missing });
    return { ok: false, error: `auth email not configured: ${report.missing.join(", ")}` };
  }

  log("send.start", { kind, to: maskEmail(recipient), from: cfg.from, subject });
  const result = await sendEmail({
    to: recipient,
    subject,
    html,
    replyTo: cfg.replyTo,
  });

  if (result.ok) {
    log("send.ok", { kind, to: maskEmail(recipient) });
  } else {
    logError("send.fail", { kind, to: maskEmail(recipient), error: result.error });
  }
  return result;
}

// ── Public API ───────────────────────────────────────────────

export type SendVerificationInput = { to: string; name?: string; verifyUrl: string };
export type SendForgotPasswordInput = { to: string; name?: string; resetUrl: string };
export type SendWelcomeInput = { to: string; name?: string; actionUrl?: string };
export type SendPasswordChangedInput = { to: string; name?: string; when?: string };

/** Send the "confirm your email" verification message. */
export async function sendVerificationEmail(input: SendVerificationInput): Promise<SendEmailResult> {
  const cfg = getAuthEmailConfig();
  const { subject, html } = buildVerificationEmail({
    name: input.name,
    verifyUrl: input.verifyUrl,
    brandName: cfg.brandName,
    tagline: cfg.tagline,
    supportEmail: cfg.supportEmail,
  });
  return dispatch("verification", input.to, subject, html);
}

/** Send the "reset your password" message. */
export async function sendForgotPasswordEmail(input: SendForgotPasswordInput): Promise<SendEmailResult> {
  const cfg = getAuthEmailConfig();
  const { subject, html } = buildForgotPasswordEmail({
    name: input.name,
    resetUrl: input.resetUrl,
    brandName: cfg.brandName,
    tagline: cfg.tagline,
    supportEmail: cfg.supportEmail,
  });
  return dispatch("forgot-password", input.to, subject, html);
}

/**
 * Send the post-verification welcome message.
 *
 * The "Start Ordering" URL must be ABSOLUTE. It used to be
 * `${cfg.siteUrl}/account`, which collapsed to the bare path "/account" when
 * no site URL was configured — an email client cannot resolve that, so the
 * customer read "[/account]Start Ordering" instead of getting a button. The
 * account page is used when we can build it, the public website otherwise;
 * a caller-supplied URL is honoured only when it is absolute.
 */
export async function sendWelcomeEmail(input: SendWelcomeInput): Promise<SendEmailResult> {
  const cfg = getAuthEmailConfig();
  const actionUrl = isEmailHref(input.actionUrl) ? String(input.actionUrl) : emailAccountUrl();
  const { subject, html } = buildWelcomeEmail({
    name: input.name,
    actionUrl,
    brandName: cfg.brandName,
    tagline: cfg.tagline,
    supportEmail: cfg.supportEmail,
  });
  return dispatch("welcome", input.to, subject, html);
}

/** Send the "your password was changed" security confirmation. */
export async function sendPasswordChangedEmail(input: SendPasswordChangedInput): Promise<SendEmailResult> {
  const cfg = getAuthEmailConfig();
  const { subject, html } = buildPasswordChangedEmail({
    name: input.name,
    when: input.when,
    resetUrl: emailUrl("/account/forgot-password"),
    brandName: cfg.brandName,
    tagline: cfg.tagline,
    supportEmail: cfg.supportEmail,
  });
  return dispatch("password-changed", input.to, subject, html);
}
