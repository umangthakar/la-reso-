// ============================================================
// Le Rasa — THE shared brand + CTA source for every email we send.
// ------------------------------------------------------------
// One place owns the three things that were previously copied into each
// template and drifted apart:
//
//   1. THE BRAND        — the wordmark ("Le Rasa"), the tagline
//                         ("House of Eggless Desserts"), the website, the
//                         support address. No template hardcodes a name.
//   2. THE LINKS        — every URL an email emits is ABSOLUTE. A relative
//                         href like "/account" is meaningless in an inbox:
//                         clients either drop it or print it beside the label
//                         ("[/account]Start ordering"), which is exactly the
//                         bug this module exists to make impossible.
//   3. THE CTA BUTTONS  — one helper renders every button in every email, so
//                         they look and behave identically in Gmail, Outlook,
//                         Apple Mail, Yahoo and on mobile.
//
// PURE + ISOMORPHIC: no I/O, no Resend, no Supabase, no "server-only", so the
// pure template builders (lib/auth-email-templates, lib/order-email-templates,
// lib/inquiry-email) and the server senders can all share it, and the test
// suite can render every email without a network.
//
// Live, admin-edited branding still wins where it exists — lib/order-email
// feeds site_settings.branding through here. This module supplies the values
// for templates that have no settings row to read, and normalises whatever it
// is given so the retired "Le Rasa Bakery" wording can never reach an inbox.
// ============================================================

import { siteUrl } from "@/lib/site-url";

// ------------------------------------------------------------
// The brand
// ------------------------------------------------------------

export type EmailBrandConfig = {
  /** The wordmark shown at the top of every email. */
  name: string;
  /** The line under the wordmark. */
  tagline: string;
  /** Absolute public site URL, no trailing slash. */
  website: string;
  /** Where customers reply for help. */
  supportEmail: string;
  /**
   * Support phone. Empty by default: the real number lives in the admin
   * settings (site_settings.contact.phone) and is passed in by lib/order-email,
   * so it is never hardcoded in two places.
   */
  phone: string;
};

export const EMAIL_BRAND: EmailBrandConfig = {
  name: "Le Rasa",
  tagline: "House of Eggless Desserts",
  website: "https://www.lerasa.co.uk",
  supportEmail: "info@lerasa.co.uk",
  phone: "",
};

/** The retired wording. Anything brand-shaped is filtered through this. */
const LEGACY_NAME = /\bLe\s+Rasa\s+Bakery\b/gi;

/**
 * Normalise brand copy coming from the database, the environment or an older
 * default so it reads as the current brand. An admin who renames the bakery
 * still wins — only the retired name is rewritten.
 */
export function emailBrandText(raw: unknown): string {
  return String(raw ?? "").replace(LEGACY_NAME, EMAIL_BRAND.name).trim();
}

/** The "From" display name + address, e.g. `Le Rasa <info@lerasa.co.uk>`. */
export function emailFrom(address: string): string {
  return `${EMAIL_BRAND.name} <${address}>`;
}

/** What the admin settings row can contribute to the email brand. */
export type EmailBrandInput = {
  /** site_settings.branding.name — the long form. */
  name?: string;
  /** site_settings.branding.short_name — the wordmark. */
  shortName?: string;
  tagline?: string;
  copyright?: string;
  supportEmail?: string;
  phone?: string;
};

export type ResolvedEmailBrand = {
  name: string;
  tagline: string;
  copyright: string;
  supportEmail: string;
  phone: string;
  website: string;
};

/**
 * Resolve the brand ONE way for every email.
 *
 * The wordmark is the SHORT name ("Le Rasa"), never the long form, with the
 * tagline underneath — that pairing is the header of every email we send.
 * Whatever the settings row holds is passed through emailBrandText(), so a
 * database that still says "Le Rasa Bakery" cannot put the retired wording
 * back in a customer's inbox, and an admin who renames the bakery still wins.
 */
export function resolveEmailBrand(input: EmailBrandInput = {}): ResolvedEmailBrand {
  const name = emailBrandText(input.shortName) || emailBrandText(input.name) || EMAIL_BRAND.name;
  return {
    name,
    tagline: emailBrandText(input.tagline) || EMAIL_BRAND.tagline,
    copyright: emailBrandText(input.copyright) || `${name}. All rights reserved.`,
    supportEmail: String(input.supportEmail ?? "").trim() || EMAIL_BRAND.supportEmail,
    phone: String(input.phone ?? "").trim() || EMAIL_BRAND.phone,
    website: emailSiteUrl(),
  };
}

// ------------------------------------------------------------
// Links — absolute or nothing
// ------------------------------------------------------------

const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * The base URL for links inside an email. lib/site-url falls back to
 * http://localhost:3000 when nothing is configured, which is correct for a
 * page and useless in someone's inbox — so a loopback base becomes the public
 * website instead. Always absolute, never a trailing slash.
 */
export function emailSiteUrl(): string {
  const base = siteUrl();
  if (!base || LOOPBACK.test(base)) return EMAIL_BRAND.website;
  return base.replace(/\/+$/, "");
}

/** An absolute email link for a site path: `emailUrl("/account")`. */
export function emailUrl(path = "/"): string {
  const p = String(path ?? "/").trim();
  const suffix = p === "" || p === "/" ? "" : p.startsWith("/") ? p : `/${p}`;
  return `${emailSiteUrl()}${suffix}`;
}

/**
 * Where "Start Ordering" points. The account page when we have a site URL,
 * the public website as the documented fallback — never a bare path.
 */
export function emailAccountUrl(): string {
  const url = emailUrl("/account");
  return isEmailHref(url) ? url : EMAIL_BRAND.website;
}

/** True when a value is a link an email client can actually follow. */
export function isEmailHref(raw: unknown): boolean {
  return /^(https?:\/\/|mailto:|tel:)/i.test(String(raw ?? "").trim());
}

/**
 * An href that is safe to render: absolute http(s)/mailto/tel, HTML-escaped.
 * Everything else — a relative path, a `javascript:` URL from an admin-managed
 * settings field, an empty string — yields "" so the caller renders nothing
 * rather than something broken.
 */
export function emailHref(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (!isEmailHref(v)) return "";
  return escapeEmailText(v);
}

// ------------------------------------------------------------
// Shared markup primitives
// ------------------------------------------------------------

/** HTML-escape anything interpolated into an email. */
export function escapeEmailText(raw: unknown): string {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The one palette every email shares. */
export const EMAIL_COLORS = {
  wine: "#873853",
  berry: "#5C2A41",
  deep: "#612437",
  accent: "#743249",
  muted: "#9C616D",
  blush: "#F9EEEA",
  canvas: "#FDF8F6",
  rule: "#F2DCD6",
  white: "#ffffff",
} as const;

export const EMAIL_FONT =
  "'Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif";

export type EmailButtonOptions = {
  /** Filled (default) or outlined. */
  variant?: "primary" | "ghost";
  /** Horizontal placement. Centred unless the surrounding copy is left-aligned. */
  align?: "left" | "center";
  /** Used when `href` is not a usable absolute link. */
  fallbackHref?: string;
};

/**
 * THE call-to-action button. Every CTA in every email goes through here.
 *
 * Why this shape:
 *   • a table, because Outlook's Word engine has no flexbox and no reliable
 *     inline-block sizing;
 *   • `bgcolor` on the <td> as well as `background`, because some clients drop
 *     the style attribute but honour the attribute;
 *   • the padding on the <td> rather than the <a>, because Outlook ignores
 *     padding on inline elements — the button would otherwise collapse to the
 *     text in exactly the client people forward from;
 *   • `display:block` on the anchor so the label fills the padded cell;
 *   • no image, no webfont, no external CSS.
 *
 * Returns "" when there is no usable absolute link and no fallback, so a
 * misconfigured URL removes the button instead of leaking a raw path.
 */
export function emailButton(
  href: string,
  label: string,
  options: EmailButtonOptions = {},
): string {
  const { variant = "primary", align = "center", fallbackHref } = options;
  const url = emailHref(href) || emailHref(fallbackHref);
  const text = String(label ?? "").trim();
  if (!url || !text) return "";

  const filled = variant !== "ghost";
  const cell = filled
    ? `background:${EMAIL_COLORS.wine};border:1px solid ${EMAIL_COLORS.wine}`
    : `background:${EMAIL_COLORS.white};border:1px solid ${EMAIL_COLORS.rule}`;
  const colour = filled ? EMAIL_COLORS.white : EMAIL_COLORS.wine;
  const weight = filled ? 700 : 600;
  const size = filled ? 15 : 14;
  const padding = filled ? "14px 34px" : "13px 30px";
  const centred = align === "center" ? "margin:0 auto;" : "";

  // `border-collapse:separate` is declared !important because the order email's
  // <style> block collapses every table — and a collapsed table drops the pill
  // radius, so the buttons rendered as hard rectangles with square borders.
  // Only an inline !important outranks a stylesheet !important.
  return `<table role="presentation" align="${align}" cellpadding="0" cellspacing="0" border="0" style="${centred}border-collapse:separate !important;border-spacing:0">
    <tr>
      <td align="center" bgcolor="${filled ? EMAIL_COLORS.wine : EMAIL_COLORS.white}" style="${cell};border-radius:999px;padding:${padding}">
        <a href="${url}" target="_blank" rel="noopener" style="display:block;font-family:${EMAIL_FONT};font-size:${size}px;line-height:1.2;font-weight:${weight};color:${colour};text-decoration:none;mso-line-height-rule:exactly;white-space:nowrap">${escapeEmailText(text)}</a>
      </td>
    </tr>
  </table>`;
}

/**
 * The header lockup — the wordmark over the tagline:
 *
 *     Le Rasa
 *     HOUSE OF EGGLESS DESSERTS
 *
 * `logoUrl` (absolute, already validated by the caller) replaces the wordmark
 * where an email has one; the tagline is always shown, so the brand reads the
 * same whether or not the logo image loads.
 */
export function emailBrandLockup(opts: {
  name?: string;
  tagline?: string;
  logoUrl?: string;
  size?: "lg" | "sm";
  align?: "left" | "center";
} = {}): string {
  const name = emailBrandText(opts.name) || EMAIL_BRAND.name;
  const tagline = emailBrandText(opts.tagline) || EMAIL_BRAND.tagline;
  const big = (opts.size ?? "lg") === "lg";
  const align = opts.align ?? "center";
  const logo = emailHref(opts.logoUrl);

  const mark = logo
    ? `<img src="${logo}" alt="${escapeEmailText(name)}" height="${big ? 46 : 36}" style="display:block;${align === "center" ? "margin:0 auto;" : ""}max-height:${big ? 46 : 36}px;width:auto;border:0" />`
    : `<div style="font-family:${EMAIL_FONT};font-size:${big ? 26 : 21}px;font-weight:800;color:${EMAIL_COLORS.white};letter-spacing:0.4px;line-height:1.2">${escapeEmailText(name)}</div>`;

  return `${mark}
    <div style="font-family:${EMAIL_FONT};font-size:${big ? 11 : 10}px;letter-spacing:2.4px;text-transform:uppercase;color:${EMAIL_COLORS.white};opacity:0.82;margin-top:${logo ? "12px" : "6px"}">${escapeEmailText(tagline)}</div>`;
}

/** "Le Rasa — House of Eggless Desserts", for a footer sign-off line. */
export function emailBrandSignature(name?: string, tagline?: string): string {
  const n = emailBrandText(name) || EMAIL_BRAND.name;
  const t = emailBrandText(tagline) || EMAIL_BRAND.tagline;
  return `${n} — ${t}`;
}
