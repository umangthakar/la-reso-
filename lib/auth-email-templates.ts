// ============================================================
// Le Rasa Bakery — Auth email HTML templates (SCAFFOLD / NOT INTEGRATED)
// ------------------------------------------------------------
// Reusable, side-effect-free HTML builders for the four transactional auth
// emails we will own once we migrate off Supabase's built-in SMTP:
//
//   • Verification      — confirm a new email address
//   • Forgot password   — reset link
//   • Welcome           — post-verification greeting
//   • Password changed   — security confirmation
//
// These are PURE builders (no Resend, no env, no I/O), matching the proven
// pattern in lib/inquiry-email.ts: inline styles only, so they render
// consistently across email clients. They are intentionally NOT wired into
// the live signup / login / reset flows yet — see lib/auth-email.ts.
//
// NOTE: kept as framework-free HTML string builders (not @react-email) to
// avoid adding a runtime dependency to production for not-yet-integrated code
// and to stay consistent with the existing inquiry email. The structure is a
// single shared layout() so a future swap to React Email is mechanical.
// ============================================================

// Brand palette — mirrors lib/inquiry-email.ts.
const WINE = "#873853";
const BERRY = "#5C2A41";
const BLUSH = "#F9EEEA";

/** HTML-escape untrusted values before interpolation. */
function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

/** A filled call-to-action button. */
function button(href: string, label: string): string {
  return `<a href="${esc(href)}" style="display:inline-block;padding:13px 26px;border-radius:999px;font-weight:700;text-decoration:none;font-size:15px;background:${WINE};color:#ffffff;border:1px solid ${WINE}">${esc(label)}</a>`;
}

export type AuthTemplateResult = { subject: string; html: string };

/** Shared brand fields every template needs. */
export type AuthTemplateBrand = {
  /** Brand name shown in the header + footer. Defaults to "Le Rasa Bakery". */
  brandName?: string;
  /** Optional support email rendered in the footer / body where relevant. */
  supportEmail?: string;
};

/**
 * Shared responsive email shell. `heading` is the big title, `bodyHtml` is the
 * pre-escaped inner content (paragraphs, buttons). Everything else matches the
 * inquiry email so the whole system reads as one brand.
 */
function layout(opts: {
  brandName: string;
  heading: string;
  bodyHtml: string;
  supportEmail?: string;
}): string {
  const { brandName, heading, bodyHtml, supportEmail } = opts;
  const support = supportEmail
    ? `<br/>Need help? Contact <a href="mailto:${esc(supportEmail)}" style="color:${WINE};text-decoration:none">${esc(supportEmail)}</a>`
    : "";
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:${BLUSH};font-family:Segoe UI,system-ui,-apple-system,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BLUSH};padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(135,56,83,0.10)">
        <tr>
          <td style="background:${WINE};padding:22px 28px">
            <div style="color:#ffffff;font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:0.85">${esc(brandName)}</div>
            <div style="color:#ffffff;font-size:22px;font-weight:800;margin-top:4px">${esc(heading)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 28px 28px;color:${BERRY};font-size:15px;line-height:1.6">
            ${bodyHtml}
          </td>
        </tr>
      </table>
      <div style="color:#9C616D;font-size:12px;margin-top:14px">${esc(brandName)} — 100% Eggless${support}</div>
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
  const brandName = data.brandName || "Le Rasa Bakery";
  const body = `${greeting(data.name)}
    <p style="margin:0 0 20px">Welcome! Please confirm your email address to activate your ${esc(brandName)} account.</p>
    <p style="margin:0 0 6px">${button(data.verifyUrl, "Verify my email")}</p>
    <p style="margin:18px 0 0;font-size:13px;color:#9C616D">This link expires soon and can only be used once. If you didn't create an account, you can safely ignore this email.</p>
    ${fallbackLink(data.verifyUrl)}`;
  return {
    subject: `Confirm your ${brandName} account`,
    html: layout({ brandName, heading: "Confirm your email", bodyHtml: body, supportEmail: data.supportEmail }),
  };
}

// ── 2. Forgot password ───────────────────────────────────────
export type ForgotPasswordEmailData = AuthTemplateBrand & {
  name?: string;
  resetUrl: string;
};

export function buildForgotPasswordEmail(data: ForgotPasswordEmailData): AuthTemplateResult {
  const brandName = data.brandName || "Le Rasa Bakery";
  const body = `${greeting(data.name)}
    <p style="margin:0 0 20px">We received a request to reset your password. Click below to choose a new one.</p>
    <p style="margin:0 0 6px">${button(data.resetUrl, "Reset my password")}</p>
    <p style="margin:18px 0 0;font-size:13px;color:#9C616D">This link expires soon. If you didn't request a reset, ignore this email — your password won't change.</p>
    ${fallbackLink(data.resetUrl)}`;
  return {
    subject: `Reset your ${brandName} password`,
    html: layout({ brandName, heading: "Reset your password", bodyHtml: body, supportEmail: data.supportEmail }),
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
  const brandName = data.brandName || "Le Rasa Bakery";
  const perks = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 24px;border-collapse:collapse">
      ${perk("🍰", "Order in a tap", "Browse our 100% eggless cakes and bakes and check out in seconds.")}
      ${perk("📦", "Track every order", "Follow your order from kitchen to doorstep, all in one place.")}
      ${perk("↺", "Reorder favourites", "Your details are saved, so repeat orders take moments.")}
    </table>`;

  const body = `${greeting(data.name)}
    <p style="margin:0 0 6px;font-size:16px;color:${BERRY}">Your account is verified and ready to go. 🎉</p>
    <p style="margin:0 0 18px">We're so glad to have you. Here's what you can do now:</p>
    ${perks}
    <p style="margin:0 0 6px" align="center">${button(data.actionUrl, "Start ordering")}</p>
    <p style="margin:20px 0 0;font-size:13px;color:#9C616D;text-align:center">Thanks for choosing our 100% eggless bakery — we can't wait to bake for you.</p>`;

  return {
    subject: `Welcome to ${brandName} 🎂`,
    html: layout({ brandName, heading: `Welcome to ${brandName}`, bodyHtml: body, supportEmail: data.supportEmail }),
  };
}

// ── 4. Password changed ──────────────────────────────────────
export type PasswordChangedEmailData = AuthTemplateBrand & {
  name?: string;
  /** Optional timestamp string shown for context (e.g. "21 Jul 2026, 14:03"). */
  when?: string;
};

export function buildPasswordChangedEmail(data: PasswordChangedEmailData): AuthTemplateResult {
  const brandName = data.brandName || "Le Rasa Bakery";
  const whenLine = data.when
    ? `<p style="margin:0 0 20px">This change was made on <strong>${esc(data.when)}</strong>.</p>`
    : "";
  const body = `${greeting(data.name)}
    <p style="margin:0 0 14px">Your ${esc(brandName)} account password was just changed.</p>
    ${whenLine}
    <p style="margin:0 0 0;font-size:14px;color:${BERRY}"><strong>Didn't do this?</strong> Reset your password immediately${data.supportEmail ? ` and contact <a href="mailto:${esc(data.supportEmail)}" style="color:${WINE};text-decoration:none">${esc(data.supportEmail)}</a>` : ""}.</p>`;
  return {
    subject: `Your ${brandName} password was changed`,
    html: layout({ brandName, heading: "Password changed", bodyHtml: body, supportEmail: data.supportEmail }),
  };
}
