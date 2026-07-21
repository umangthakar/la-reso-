// ============================================================
// Le Rasa Bakery — Auth Email module (SCAFFOLD / NOT INTEGRATED)
// ------------------------------------------------------------
// Reusable service for the four transactional AUTH emails we will own after
// migrating off Supabase's built-in SMTP:
//
//   sendVerificationEmail()      — confirm a new email address
//   sendForgotPasswordEmail()    — password reset link
//   sendWelcomeEmail()           — post-verification greeting
//   sendPasswordChangedEmail()   — security confirmation
//
// IMPORTANT: this file is intentionally NOT imported by any auth flow yet.
// signup / login / forgot-password still run entirely through Supabase Auth
// (lib/use-auth.ts) exactly as before. This is groundwork only.
//
// It reuses the existing, proven Resend wrapper (lib/email.ts) so there is a
// single Resend integration point, plus:
//   • centralized configuration      (getAuthEmailConfig)
//   • environment validation          (validateAuthEmailEnv)
//   • structured logging              ([auth-email] prefixed)
//
// Server-only: never import from a "use client" module.
// ============================================================

import "server-only";
import { sendEmail, type SendEmailResult } from "@/lib/email";
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
  /** Support address surfaced in templates (falls back to Reply-To). */
  supportEmail?: string;
  /** Absolute site origin (no trailing slash) for building links. */
  siteUrl: string;
};

const DEFAULT_FROM = "Le Rasa Bakery <onboarding@resend.dev>";
const DEFAULT_BRAND = "Le Rasa Bakery";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Resolve the auth-email configuration from the environment. Pure read — never
 * throws, so importing this module can't break a build. Precedence:
 *   from       ← AUTH_EMAIL_FROM → EMAIL_FROM → hardcoded resend.dev default
 *   siteUrl    ← NEXT_PUBLIC_SITE_URL → SITE_URL → "" (caller must supply)
 */
export function getAuthEmailConfig(): AuthEmailConfig {
  const from = env("AUTH_EMAIL_FROM") || env("EMAIL_FROM") || DEFAULT_FROM;
  const replyTo = env("AUTH_EMAIL_REPLY_TO") || undefined;
  const supportEmail = env("AUTH_SUPPORT_EMAIL") || env("OWNER_EMAIL") || replyTo || undefined;
  const siteUrl = (env("NEXT_PUBLIC_SITE_URL") || env("SITE_URL")).replace(/\/$/, "");
  const brandName = env("NEXT_PUBLIC_BRAND_NAME") || DEFAULT_BRAND;
  return { from, replyTo, brandName, supportEmail, siteUrl };
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
    warnings.push("NEXT_PUBLIC_SITE_URL/SITE_URL unset — callers must pass absolute link URLs");
  }
  if (!env("AUTH_SUPPORT_EMAIL") && !env("OWNER_EMAIL")) {
    warnings.push("AUTH_SUPPORT_EMAIL/OWNER_EMAIL unset — support line omitted from emails");
  }

  const ok = missing.length === 0;
  log("env.validate", { ok, missing, warnings });
  return { ok, missing, warnings };
}

// ── Structured logging ───────────────────────────────────────

type LogData = Record<string, unknown>;

/** One structured, prefixed log line per auth-email event. */
function log(event: string, data: LogData): void {
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
    supportEmail: cfg.supportEmail,
  });
  return dispatch("forgot-password", input.to, subject, html);
}

/** Send the post-verification welcome message. */
export async function sendWelcomeEmail(input: SendWelcomeInput): Promise<SendEmailResult> {
  const cfg = getAuthEmailConfig();
  const actionUrl = input.actionUrl || `${cfg.siteUrl}/account` || "/account";
  const { subject, html } = buildWelcomeEmail({
    name: input.name,
    actionUrl,
    brandName: cfg.brandName,
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
    brandName: cfg.brandName,
    supportEmail: cfg.supportEmail,
  });
  return dispatch("password-changed", input.to, subject, html);
}
