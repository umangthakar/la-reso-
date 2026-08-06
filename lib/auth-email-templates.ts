// ============================================================
// Le Rasa — Auth email HTML templates
// ------------------------------------------------------------
// Reusable, side-effect-free HTML builders for the four transactional auth
// emails, sent by lib/auth-email.ts:
//
//   • Verification      — confirm a new email address
//   • Forgot password   — reset link
//   • Welcome           — post-verification greeting
//   • Password changed   — security confirmation
//
// These are PURE builders (no Resend, no env, no I/O), matching the proven
// pattern in lib/inquiry-email.ts: inline styles only, so they render
// consistently across email clients.
//
// The BRAND (wordmark + tagline) and every CTA BUTTON come from
// lib/email-brand.ts — the single source shared with the order and inquiry
// emails. Nothing brand-shaped is written twice, and no button is hand-rolled.
//
// NOTE: kept as framework-free HTML string builders (not @react-email) to stay
// consistent with the existing order + inquiry emails. The structure is a
// single shared layout() so a future swap to React Email is mechanical.
// ============================================================

import {
  EMAIL_BRAND,
  EMAIL_COLORS,
  emailBrandLockup,
  emailBrandSignature,
  emailBrandText,
  emailButton,
  escapeEmailText,
} from "@/lib/email-brand";

// Brand palette — the shared values, aliased for readability below.
const WINE = EMAIL_COLORS.wine;
const BERRY = EMAIL_COLORS.berry;
const BLUSH = EMAIL_COLORS.blush;

/** HTML-escape untrusted values before interpolation. */
const esc = escapeEmailText;

/** A filled call-to-action button — the shared, cross-client helper. */
function button(href: string, label: string, align: "left" | "center" = "left"): string {
  return emailButton(href, label, { align });
}

export type AuthTemplateResult = { subject: string; html: string };

/** Shared brand fields every template needs. */
export type AuthTemplateBrand = {
  /** Brand name shown in the header + footer. Defaults to EMAIL_BRAND.name. */
  brandName?: string;
  /** The line under the wordmark. Defaults to EMAIL_BRAND.tagline. */
  tagline?: string;
  /** Optional support email rendered in the footer / body where relevant. */
  supportEmail?: string;
};

/** Resolve the brand for one template: caller → shared default. */
function brandOf(data: AuthTemplateBrand): { brandName: string; tagline: string } {
  return {
    brandName: emailBrandText(data.brandName) || EMAIL_BRAND.name,
    tagline: emailBrandText(data.tagline) || EMAIL_BRAND.tagline,
  };
}

/**
 * Shared responsive email shell. `heading` is the big title, `bodyHtml` is the
 * pre-escaped inner content (paragraphs, buttons). Everything else matches the
 * inquiry email so the whole system reads as one brand.
 */
function layout(opts: {
  brandName: string;
  tagline: string;
  heading: string;
  bodyHtml: string;
  supportEmail?: string;
}): string {
  const { brandName, tagline, heading, bodyHtml, supportEmail } = opts;
  const support = supportEmail
    ? `<br/>Need help? Contact <a href="mailto:${esc(supportEmail)}" style="color:${WINE};text-decoration:none">${esc(supportEmail)}</a>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BLUSH};font-family:Segoe UI,system-ui,-apple-system,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BLUSH};padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(135,56,83,0.10)">
        <tr>
          <td style="background:${WINE};padding:22px 28px">
            ${emailBrandLockup({ name: brandName, tagline, size: "sm", align: "left" })}
            <div style="color:#ffffff;font-size:22px;font-weight:800;margin-top:12px">${esc(heading)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 28px 28px;color:${BERRY};font-size:15px;line-height:1.6">
            ${bodyHtml}
          </td>
        </tr>
      </table>
      <div style="color:#9C616D;font-size:12px;margin-top:14px">${esc(emailBrandSignature(brandName, tagline))}${support}</div>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Greeting line — "Hi Jane," or a neutral fallback. */
function greeting(name?: string): string {
  const n = (name ?? "").trim();
  return `<p style="margin:0 0 14px">Hi${n ? " " + esc(n) : " there"},</p>`;
}

/** Small muted note explaining a link fallback. */
function fallbackLink(url: string): string {
  return `<p style="margin:18px 0 0;font-size:13px;color:#9C616D">If the button doesn't work, copy and paste this link into your browser:<br/><a href="${esc(url)}" style="color:${WINE};word-break:break-all">${esc(url)}</a></p>`;
}

// ── 1. Verify email ──────────────────────────────────────────
export type VerificationEmailData = AuthTemplateBrand & {
  name?: string;
  verifyUrl: string;
};

export function buildVerificationEmail(data: VerificationEmailData): AuthTemplateResult {
  const { brandName, tagline } = brandOf(data);
  const body = `${greeting(data.name)}
    <p style="margin:0 0 20px">Welcome! Please confirm your email address to activate your ${esc(brandName)} account.</p>
    <p style="margin:0 0 6px">${button(data.verifyUrl, "Verify Email")}</p>
    <p style="margin:18px 0 0;font-size:13px;color:#9C616D">This link expires soon and can only be used once. If you didn't create an account, you can safely ignore this email.</p>
    ${fallbackLink(data.verifyUrl)}`;
  return {
    subject: `Confirm your ${brandName} account`,
    html: layout({
      brandName,
      tagline,
      heading: "Confirm your email",
      bodyHtml: body,
      supportEmail: data.supportEmail,
    }),
  };
}

// ── 2. Forgot password ───────────────────────────────────────
export type ForgotPasswordEmailData = AuthTemplateBrand & {
  name?: string;
  resetUrl: string;
};

export function buildForgotPasswordEmail(data: ForgotPasswordEmailData): AuthTemplateResult {
  const { brandName, tagline } = brandOf(data);
  const body = `${greeting(data.name)}
    <p style="margin:0 0 20px">We received a request to reset your password. Click below to choose a new one.</p>
    <p style="margin:0 0 6px">${button(data.resetUrl, "Reset Password")}</p>
    <p style="margin:18px 0 0;font-size:13px;color:#9C616D">This link expires soon. If you didn't request a reset, ignore this email — your password won't change.</p>
    ${fallbackLink(data.resetUrl)}`;
  return {
    subject: `Reset your ${brandName} password`,
    html: layout({
      brandName,
      tagline,
      heading: "Reset your password",
      bodyHtml: body,
      supportEmail: data.supportEmail,
    }),
  };
}

// ── 3. Welcome ───────────────────────────────────────────────
export type WelcomeEmailData = AuthTemplateBrand & {
  name?: string;
  /** Where the "Start ordering" button points (e.g. the storefront). */
  actionUrl: string;
};

/** A single "what you can do now" perk row (emoji + label + copy). */
function perk(icon: string, title: string, copy: string): string {
  return `<tr>
    <td width="34" valign="top" style="padding:8px 12px 8px 0;font-size:20px;line-height:1.2">${icon}</td>
    <td valign="top" style="padding:8px 0">
      <div style="color:${BERRY};font-weight:700;font-size:14px">${esc(title)}</div>
      <div style="color:#7A5460;font-size:13px;line-height:1.5">${esc(copy)}</div>
    </td>
  </tr>`;
}

export function buildWelcomeEmail(data: WelcomeEmailData): AuthTemplateResult {
  const { brandName, tagline } = brandOf(data);
  const perks = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 24px;border-collapse:collapse">
      ${perk("🍰", "Order in a tap", "Browse our 100% eggless cakes and bakes and check out in seconds.")}
      ${perk("📦", "Track every order", "Follow your order from kitchen to doorstep, all in one place.")}
      ${perk("↺", "Reorder favourites", "Your details are saved, so repeat orders take moments.")}
    </table>`;

  // The CTA is rendered by the shared helper with an ABSOLUTE fallback: this
  // is the button that used to reach inboxes as "[/account]Start ordering"
  // because a relative path was handed to an email client.
  const cta = emailButton(data.actionUrl, "Start Ordering", {
    align: "center",
    fallbackHref: EMAIL_BRAND.website,
  });

  const body = `${greeting(data.name)}
    <p style="margin:0 0 6px;font-size:16px;color:${BERRY}">Your account is verified and ready to go. 🎉</p>
    <p style="margin:0 0 18px">We're so glad to have you. Here's what you can do now:</p>
    ${perks}
    <div style="margin:0 0 6px">${cta}</div>
    <p style="margin:20px 0 0;font-size:13px;color:#9C616D;text-align:center">Thanks for choosing our 100% eggless bakery — we can't wait to bake for you.</p>`;

  return {
    subject: `Welcome to ${brandName} 🎂`,
    html: layout({
      brandName,
      tagline,
      heading: `Welcome to ${brandName}`,
      bodyHtml: body,
      supportEmail: data.supportEmail,
    }),
  };
}

// ── 4. Password changed ──────────────────────────────────────
export type PasswordChangedEmailData = AuthTemplateBrand & {
  name?: string;
  /** Optional timestamp string shown for context (e.g. "21 Jul 2026, 14:03"). */
  when?: string;
  /** Absolute URL of the password-reset page, for the "didn't do this?" CTA. */
  resetUrl?: string;
};

export function buildPasswordChangedEmail(data: PasswordChangedEmailData): AuthTemplateResult {
  const { brandName, tagline } = brandOf(data);
  const whenLine = data.when
    ? `<p style="margin:0 0 20px">This change was made on <strong>${esc(data.when)}</strong>.</p>`
    : "";
  // "Reset your password immediately" was instruction without a way to act on
  // it; the shared helper drops the button entirely if the URL isn't usable.
  const cta = data.resetUrl ? emailButton(data.resetUrl, "Reset Password", { align: "left" }) : "";
  const body = `${greeting(data.name)}
    <p style="margin:0 0 14px">Your ${esc(brandName)} account password was just changed.</p>
    ${whenLine}
    <p style="margin:0 0 ${cta ? "16px" : "0"};font-size:14px;color:${BERRY}"><strong>Didn't do this?</strong> Reset your password immediately${data.supportEmail ? ` and contact <a href="mailto:${esc(data.supportEmail)}" style="color:${WINE};text-decoration:none">${esc(data.supportEmail)}</a>` : ""}.</p>
    ${cta}`;
  return {
    subject: `Your ${brandName} password was changed`,
    html: layout({
      brandName,
      tagline,
      heading: "Password changed",
      bodyHtml: body,
      supportEmail: data.supportEmail,
    }),
  };
}
