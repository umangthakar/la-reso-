// ============================================================
// Le Rasa Bakery — ORDER EMAIL TEMPLATES (pure, side-effect-free)
// ------------------------------------------------------------
// The four customer-facing order emails, as ONE design system:
//
//   buildOrderPlacedEmail     — payment succeeded, order saved (Pending)
//   buildOrderAcceptedEmail   — the owner accepted it (Received)
//   buildOrderCancelledEmail  — admin / customer / auto-cancel sweep
//   buildOrderRefundedEmail   — Stripe confirmed the refund
//
// Every one of them is built from the SAME shell(): the same header (logo +
// wordmark), the same status ribbon, the same buttons and the same footer, so
// the whole lifecycle reads as one brand rather than four separate emails.
//
// PURE BUILDERS — no Resend, no env, no Supabase, no I/O. They take the brand
// and the order and return { subject, html }. lib/order-email.ts owns the
// data, the credentials, the sending and the duplicate protection; this file
// owns the words and the layout. Same split as
// lib/notification-content ↔ lib/notifications, and the same reason: the
// wording can be exercised without a network.
//
// HTML EMAIL CONSTRAINTS drive the markup, not preference:
//   • tables for layout — flexbox and grid are unsupported in Outlook
//   • inline styles for everything that matters — Gmail strips <head><style>
//     on some clients, so the <style> block only ever ENHANCES (it stacks the
//     two-column rows on narrow screens); the inline base already renders
//     correctly without it
//   • no external CSS, no webfonts, no scripts
// ============================================================

import { money } from "@/lib/pricing";

// ------------------------------------------------------------
// Brand palette — the same wine/blush values as the storefront and the
// existing auth + inquiry emails, so nothing looks bolted on.
// ------------------------------------------------------------
const WINE = "#873853";
const BERRY = "#5C2A41";
const DEEP = "#612437";
const ACCENT = "#743249";
const MUTED = "#9C616D";
const BLUSH = "#F9EEEA";
const CANVAS = "#FDF8F6";
const RULE = "#F2DCD6";
const WHITE = "#ffffff";

const FONT = "'Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif";

/** HTML-escape anything that came from a customer, an admin or the database. */
function esc(raw: unknown): string {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Escape a URL for an href/src, refusing anything that isn't http(s) or
 * mailto/tel. Logo and social links come from the admin settings row, so a
 * `javascript:` value would otherwise ride into the customer's inbox.
 */
function safeUrl(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  if (!/^(https?:|mailto:|tel:)/i.test(v)) return "";
  return esc(v);
}

// ------------------------------------------------------------
// Shared brand + order shapes. Everything the templates render arrives
// already resolved — a builder never reaches for a default or a fallback,
// so what the customer reads is exactly what the order says.
// ------------------------------------------------------------

export type OrderEmailBrand = {
  /** Full bakery name, e.g. "Le Rasa Bakery". */
  brandName: string;
  /** Compact wordmark, e.g. "Le Rasa". */
  shortName: string;
  /** The line under the wordmark. */
  tagline: string;
  /** Absolute logo URL, or "" to fall back to the wordmark. */
  logoUrl: string;
  /** Absolute site base URL, no trailing slash. */
  siteUrl: string;
  /** Absolute URL of the customer's order history. */
  ordersUrl: string;
  /** Absolute URL of the contact page. */
  contactUrl: string;
  supportEmail: string;
  phone: string;
  instagramUrl: string;
  address: string;
  /** Text after "© {year}" in the footer. */
  copyright: string;
};

/** One accessory chosen in the customization wizard, as saved on the order. */
export type OrderEmailAccessory = {
  label: string;
  value: string;
  /** The extra charged for this line, quantity included. */
  price: number;
};

export type OrderEmailItem = {
  /** Product name WITHOUT the size suffix. */
  name: string;
  /** The chosen size label, or "" when the product has no sizes. */
  size: string;
  quantity: number;
  /** Base price per unit. */
  unitPrice: number;
  /** Accessory extra per unit. */
  addons: number;
  /** (unitPrice + addons) × quantity. */
  lineTotal: number;
  /** Absolute product image URL, or "" when there isn't one. */
  imageUrl: string;
  accessories: OrderEmailAccessory[];
};

export type OrderEmailData = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  phone: string;
  /** Human-readable, already formatted (e.g. "6 August 2026"). */
  orderDate: string;
  deliveryDate: string;
  addressLine: string;
  city: string;
  postcode: string;
  items: OrderEmailItem[];
  /** The customer's own notes — internal annotations are stripped upstream. */
  specialInstructions: string;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  /** e.g. "Card (Stripe)". */
  paymentMethod: string;
  /** e.g. "Paid", "Refunded", "Refund in progress". */
  paymentStatus: string;
  /** Human label for the order's current status, e.g. "Pending". */
  orderStatus: string;
  /** Present on a cancellation/refund: "Refunded" / "Refund in progress". */
  refundStatus?: string;
  /** The amount being refunded. */
  refundAmount?: number;
  /** Human-readable cancellation date. */
  cancelledAt?: string;
  /** Why it was cancelled, in the customer's language. */
  cancellationReason?: string;
  /** How long the money takes to land, e.g. "5–10 business days". */
  refundEta?: string;
};

// ------------------------------------------------------------
// Building blocks
// ------------------------------------------------------------

type Tone = "wine" | "green" | "amber" | "grey";

const TONES: Record<Tone, { bg: string; fg: string }> = {
  wine: { bg: BLUSH, fg: WINE },
  green: { bg: "#E7F4EC", fg: "#1F6B45" },
  amber: { bg: "#FDF1DF", fg: "#8A5A12" },
  grey: { bg: "#F1ECEE", fg: "#6B5560" },
};

/** The status ribbon under the header — "Order Status: Pending". */
function statusPill(label: string, value: string, tone: Tone): string {
  const t = TONES[tone];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:18px 24px 0">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background:${t.bg};border-radius:999px;padding:9px 20px;font-family:${FONT};font-size:13px;color:${t.fg};font-weight:700;letter-spacing:0.3px">
              ${esc(label)}: ${esc(value)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

/** A filled call-to-action button (bulletproof enough for Outlook). */
function primaryButton(href: string, label: string): string {
  const url = safeUrl(href);
  if (!url) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
    <tr>
      <td align="center" style="background:${WINE};border-radius:999px">
        <a href="${url}" style="display:inline-block;padding:14px 34px;font-family:${FONT};font-size:15px;font-weight:700;color:${WHITE};text-decoration:none;border-radius:999px">${esc(label)}</a>
      </td>
    </tr>
  </table>`;
}

/** An outlined secondary button. */
function ghostButton(href: string, label: string): string {
  const url = safeUrl(href);
  if (!url) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
    <tr>
      <td align="center" style="background:${WHITE};border:1px solid ${RULE};border-radius:999px">
        <a href="${url}" style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:14px;font-weight:600;color:${WINE};text-decoration:none;border-radius:999px">${esc(label)}</a>
      </td>
    </tr>
  </table>`;
}

/**
 * The action row every email ends on: Track Orders, Visit Website, Contact
 * Support. Stacked on mobile by the .btn-stack rule in the <style> block.
 */
function actionRow(brand: OrderEmailBrand): string {
  const track = primaryButton(brand.ordersUrl, "Track Orders");
  const visit = ghostButton(brand.siteUrl, "Visit Website");
  const support = ghostButton(
    brand.contactUrl || (brand.supportEmail ? `mailto:${brand.supportEmail}` : ""),
    "Contact Support",
  );
  const cells = [track, visit, support].filter(Boolean);
  if (cells.length === 0) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 4px">
    <tr>
      ${cells
        .map(
          (c) =>
            `<td class="btn-stack" align="center" style="padding:0 4px 10px" valign="top">${c}</td>`,
        )
        .join("")}
    </tr>
  </table>`;
}

/** Section heading — small, uppercase, wine. */
function sectionTitle(text: string): string {
  return `<p style="margin:26px 0 10px;font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:${WINE}">${esc(text)}</p>`;
}

/** One label/value cell inside the detail grid. */
function detailCell(label: string, value: string): string {
  return `<div style="font-family:${FONT};padding:0 0 14px">
    <div style="font-size:11px;letter-spacing:0.9px;text-transform:uppercase;color:${MUTED};font-weight:700">${esc(label)}</div>
    <div style="font-size:14px;color:${DEEP};font-weight:600;line-height:1.5;margin-top:3px">${esc(value)}</div>
  </div>`;
}

/**
 * A two-column label/value grid that becomes one column on narrow screens.
 * Empty values are dropped rather than rendered blank — an order without a
 * delivery date must not show "Delivery Date: —".
 */
function detailGrid(pairs: [string, string][]): string {
  const rows = pairs.filter(([, v]) => String(v ?? "").trim() !== "");
  if (rows.length === 0) return "";

  const cells: string[] = [];
  for (let i = 0; i < rows.length; i += 2) {
    const left = rows[i];
    const right = rows[i + 1];
    cells.push(`<tr>
      <td class="col" width="50%" valign="top" style="padding-right:12px">${detailCell(left[0], left[1])}</td>
      <td class="col" width="50%" valign="top">${right ? detailCell(right[0], right[1]) : ""}</td>
    </tr>`);
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${cells.join("")}</table>`;
}

/** A soft callout box (notes, refund progress, delivery address). */
function calloutBox(title: string, bodyHtml: string, bg = BLUSH): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0">
    <tr>
      <td style="background:${bg};border-radius:14px;padding:16px 18px;font-family:${FONT}">
        <div style="font-size:11px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;color:${ACCENT}">${esc(title)}</div>
        <div style="margin-top:6px;font-size:14px;color:${DEEP};line-height:1.6">${bodyHtml}</div>
      </td>
    </tr>
  </table>`;
}

/**
 * The thumbnail cell. Rendered for EVERY row once any item in the order has an
 * image — a product without one gets a blank cell of the same width, because
 * omitting the cell instead shifts that row's columns and the whole table
 * loses its alignment.
 */
function itemThumb(item: OrderEmailItem): string {
  const src = safeUrl(item.imageUrl);
  const img = src
    ? `<img src="${src}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border-radius:12px;object-fit:cover;border:1px solid ${RULE}" />`
    : `<div style="width:56px;height:56px;border-radius:12px;background:${BLUSH}"></div>`;
  return `<td width="68" valign="top" style="padding:14px 12px 14px 0;border-bottom:1px solid ${RULE}">${img}</td>`;
}

/** One order line: image, name, size, quantity, accessories, line total. */
function itemRow(item: OrderEmailItem, withThumbs: boolean): string {
  const size = item.size
    ? `<div style="font-size:13px;color:${MUTED};margin-top:2px">Size: <strong style="color:${ACCENT};font-weight:600">${esc(item.size)}</strong></div>`
    : "";

  const accessories = item.accessories.length
    ? `<ul style="margin:8px 0 0;padding-left:18px;color:${MUTED};font-size:13px;line-height:1.6">${item.accessories
        .map(
          (a) =>
            `<li>${esc(a.label)}: <strong style="color:${DEEP};font-weight:600">${esc(a.value)}</strong>${
              a.price > 0 ? ` <span style="color:${MUTED}">(+${money(a.price)})</span>` : ""
            }</li>`,
        )
        .join("")}</ul>`
    : "";

  return `<tr>
    ${withThumbs ? itemThumb(item) : ""}
    <td valign="top" style="padding:14px 10px 14px 0;border-bottom:1px solid ${RULE};font-family:${FONT}">
      <div style="font-size:15px;font-weight:700;color:${DEEP};line-height:1.4">${esc(item.name)}</div>
      ${size}
      <div style="font-size:13px;color:${MUTED};margin-top:2px">Quantity: <strong style="color:${ACCENT};font-weight:600">${item.quantity}</strong></div>
      ${accessories}
    </td>
    <td valign="top" align="right" style="padding:14px 0;border-bottom:1px solid ${RULE};font-family:${FONT};font-size:15px;font-weight:700;color:${ACCENT};white-space:nowrap">
      ${money(item.lineTotal)}
    </td>
  </tr>`;
}

/**
 * The items table. The thumbnail column only exists when at least one product
 * has an image, so a text-only order doesn't render a column of empty cells.
 */
function itemsTable(items: OrderEmailItem[]): string {
  if (items.length === 0) return "";
  const withThumbs = items.some((i) => safeUrl(i.imageUrl) !== "");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid ${RULE}">
    ${items.map((item) => itemRow(item, withThumbs)).join("")}
  </table>`;
}

/** One row of the totals table. */
function totalRow(label: string, value: string, strong = false): string {
  return `<tr>
    <td style="padding:${strong ? "12px 0 0" : "5px 0"};font-family:${FONT};font-size:${strong ? "15px" : "14px"};color:${strong ? DEEP : MUTED};font-weight:${strong ? "800" : "500"}">${esc(label)}</td>
    <td align="right" style="padding:${strong ? "12px 0 0" : "5px 0"};font-family:${FONT};font-size:${strong ? "19px" : "14px"};color:${ACCENT};font-weight:${strong ? "800" : "600"};white-space:nowrap">${esc(value)}</td>
  </tr>`;
}

/** Subtotal / delivery / discount / grand total. */
function totalsTable(order: OrderEmailData): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:16px">
    ${totalRow("Subtotal", money(order.subtotal))}
    ${order.discount > 0 ? totalRow("Discount", `−${money(order.discount)}`) : ""}
    ${totalRow("Delivery Fee", order.deliveryFee === 0 ? "Free" : money(order.deliveryFee))}
    <tr><td colspan="2" style="padding-top:10px;border-top:1px solid ${RULE}"></td></tr>
    ${totalRow("Grand Total", money(order.total), true)}
  </table>`;
}

/** The delivery address block, assembled from whatever parts exist. */
function addressBlock(order: OrderEmailData): string {
  const parts = [order.addressLine, order.city, order.postcode].filter(
    (p) => String(p ?? "").trim() !== "",
  );
  if (parts.length === 0) return "";
  return calloutBox(
    "Delivery Address",
    parts.map((p) => esc(p)).join("<br/>"),
  );
}

/** The customer's own notes, when they left any. */
function notesBlock(order: OrderEmailData): string {
  const notes = String(order.specialInstructions ?? "").trim();
  if (!notes) return "";
  return calloutBox("Special Instructions", esc(notes).replace(/\n/g, "<br/>"));
}

// ------------------------------------------------------------
// The shell — header, body, footer. Every email is this plus its body.
// ------------------------------------------------------------

function header(brand: OrderEmailBrand): string {
  const logo = safeUrl(brand.logoUrl);
  const mark = logo
    ? `<img src="${logo}" alt="${esc(brand.brandName)}" height="46" style="display:block;margin:0 auto;max-height:46px;width:auto;border:0" />`
    : `<div style="font-family:${FONT};font-size:26px;font-weight:800;color:${WHITE};letter-spacing:0.4px">${esc(brand.shortName)}</div>`;

  return `<tr>
    <td align="center" style="background:${WINE};padding:26px 24px 22px">
      ${mark}
      <div style="font-family:${FONT};font-size:11px;letter-spacing:2.4px;text-transform:uppercase;color:${WHITE};opacity:0.82;margin-top:${logo ? "12px" : "6px"}">${esc(brand.tagline)}</div>
    </td>
  </tr>`;
}

/** One footer contact line, e.g. "✉ hello@lerasa.co.uk" as a mailto link. */
function footerLink(href: string, label: string): string {
  const url = safeUrl(href);
  if (!url || !label) return "";
  return `<a href="${url}" style="color:${WINE};text-decoration:none;font-weight:600">${esc(label)}</a>`;
}

function footer(brand: OrderEmailBrand): string {
  const links = [
    footerLink(brand.siteUrl, brand.siteUrl.replace(/^https?:\/\//i, "")),
    footerLink(brand.supportEmail ? `mailto:${brand.supportEmail}` : "", brand.supportEmail),
    footerLink(brand.phone ? `tel:${brand.phone.replace(/[^\d+]/g, "")}` : "", brand.phone),
    footerLink(brand.instagramUrl, "Instagram"),
  ].filter(Boolean);

  const support = brand.supportEmail
    ? `<div style="margin-top:10px;font-family:${FONT};font-size:12px;color:${MUTED};line-height:1.6">Need a hand with this order? Email <a href="mailto:${esc(brand.supportEmail)}" style="color:${WINE};text-decoration:none;font-weight:600">${esc(brand.supportEmail)}</a> and we'll help.</div>`
    : "";

  const address = brand.address
    ? `<div style="margin-top:8px;font-family:${FONT};font-size:12px;color:${MUTED}">${esc(brand.address)}</div>`
    : "";

  return `<tr>
    <td style="padding:0 24px 4px">
      <div style="border-top:1px solid ${RULE};padding-top:20px"></div>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:0 24px 28px">
      <div style="font-family:${FONT};font-size:13px;color:${MUTED};line-height:2">
        ${links.join(`<span style="color:${RULE};padding:0 8px">•</span>`)}
      </div>
      ${support}
      ${address}
      <div style="margin-top:14px;font-family:${FONT};font-size:11px;color:${MUTED};opacity:0.85">
        © ${new Date().getFullYear()} ${esc(brand.copyright)}
      </div>
    </td>
  </tr>`;
}

/**
 * The responsive shell. `preheader` is the grey line inboxes show next to the
 * subject — set deliberately, or clients pick the first words of the header.
 */
function shell(opts: {
  brand: OrderEmailBrand;
  title: string;
  preheader: string;
  statusLabel: string;
  statusValue: string;
  statusTone: Tone;
  bodyHtml: string;
}): string {
  const { brand, title, preheader, statusLabel, statusValue, statusTone, bodyHtml } = opts;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${esc(title)}</title>
<style>
  /* PROGRESSIVE ENHANCEMENT ONLY — the inline styles above already render
     correctly in clients that strip this block. */
  body { margin:0 !important; padding:0 !important; width:100% !important; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  table { border-collapse:collapse !important; }
  a { text-decoration:none; }
  @media only screen and (max-width:600px) {
    .wrap { width:100% !important; padding:0 !important; }
    .card { border-radius:0 !important; }
    /* The page gutter goes on a narrow screen: with it, the items row
       (thumbnail + name + a nowrap price) has a min-content width wider than
       a 320px viewport and the whole email scrolls sideways. */
    .outer { padding-left:0 !important; padding-right:0 !important; }
    .pad { padding-left:18px !important; padding-right:18px !important; }
    /* Two-column detail rows and the button row become single column. */
    .col, .btn-stack {
      display:block !important;
      width:100% !important;
      max-width:100% !important;
      padding-right:0 !important;
      box-sizing:border-box !important;
    }
  }
  @media only screen and (max-width:380px) {
    .pad { padding-left:14px !important; padding-right:14px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${CANVAS};font-family:${FONT};-webkit-font-smoothing:antialiased">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS}">
    <tr>
      <td class="outer" align="center" style="padding:26px 12px">
        <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">
          <tr>
            <td>
              <table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${WHITE};border-radius:20px;overflow:hidden;box-shadow:0 10px 34px rgba(135,56,83,0.10)">
                ${header(brand)}
                <tr><td>${statusPill(statusLabel, statusValue, statusTone)}</td></tr>
                <tr>
                  <td class="pad" style="padding:22px 30px 8px">
                    ${bodyHtml}
                  </td>
                </tr>
                ${footer(brand)}
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 10px 0;font-family:${FONT};font-size:11px;color:${MUTED};line-height:1.6">
              You're receiving this because you placed an order with ${esc(brand.brandName)}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** The opening block every email shares: greeting, headline, message. */
function intro(name: string, headline: string, message: string): string {
  const who = String(name ?? "").trim();
  return `<p style="margin:0 0 4px;font-family:${FONT};font-size:15px;color:${MUTED}">Hi ${esc(who || "there")},</p>
    <h1 style="margin:0 0 12px;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:800;color:${WINE}">${esc(headline)}</h1>
    <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.7;color:${BERRY}">${message}</p>`;
}

export type OrderEmailTemplate = { subject: string; html: string };

// ============================================================
// 1. ORDER CONFIRMATION — sent once the payment succeeded AND the
//    order row exists. Never before either.
// ============================================================
export function buildOrderPlacedEmail(
  brand: OrderEmailBrand,
  order: OrderEmailData,
): OrderEmailTemplate {
  const body = `
    ${intro(
      order.customerName,
      "Thank you for your order!",
      `Thank you for ordering with ${esc(brand.shortName)}. Your order has been successfully placed.<br/><br/>
       Our bakery team is reviewing your order. We'll notify you once your order has been accepted.`,
    )}

    ${sectionTitle("Order Details")}
    ${detailGrid([
      ["Order Number", order.orderNumber],
      ["Order Date", order.orderDate],
      ["Delivery Date", order.deliveryDate],
      ["Order Status", order.orderStatus],
      ["Payment Method", order.paymentMethod],
      ["Payment Status", order.paymentStatus],
    ])}

    ${sectionTitle("Your Details")}
    ${detailGrid([
      ["Name", order.customerName],
      ["Phone", order.phone],
      ["Email", order.customerEmail],
      ["Postcode", order.postcode],
      ["City", order.city],
    ])}

    ${addressBlock(order)}

    ${sectionTitle("Your Order")}
    ${itemsTable(order.items)}
    ${totalsTable(order)}

    ${notesBlock(order)}
    ${actionRow(brand)}`;

  return {
    subject: "Order Confirmed — Thank you for your order!",
    html: shell({
      brand,
      title: `Order ${order.orderNumber} confirmed`,
      preheader: `Order ${order.orderNumber} is placed — we're reviewing it now.`,
      statusLabel: "Order Status",
      statusValue: order.orderStatus,
      statusTone: "amber",
      bodyHtml: body,
    }),
  };
}

// ============================================================
// 2. ORDER ACCEPTED — sent exactly once, on Pending → Accepted.
// ============================================================
export function buildOrderAcceptedEmail(
  brand: OrderEmailBrand,
  order: OrderEmailData,
): OrderEmailTemplate {
  const body = `
    ${intro(
      order.customerName,
      "Great news — your order has been accepted!",
      `Your order has been accepted by our bakery. Our team has started preparing your order.<br/><br/>
       We'll notify you when it's ready or out for delivery.`,
    )}

    ${sectionTitle("Order Details")}
    ${detailGrid([
      ["Order Number", order.orderNumber],
      ["Current Status", order.orderStatus],
      ["Delivery Date", order.deliveryDate],
      ["Name", order.customerName],
    ])}

    ${addressBlock(order)}

    ${sectionTitle("Your Order")}
    ${itemsTable(order.items)}
    ${totalsTable(order)}

    ${notesBlock(order)}
    ${actionRow(brand)}`;

  return {
    subject: "Your Order Has Been Accepted!",
    html: shell({
      brand,
      title: `Order ${order.orderNumber} accepted`,
      preheader: `We've started preparing order ${order.orderNumber}.`,
      statusLabel: "Order Status",
      statusValue: order.orderStatus,
      statusTone: "green",
      bodyHtml: body,
    }),
  };
}

// ============================================================
// 3. ORDER CANCELLED — admin, customer, or the auto-cancel sweep.
//    Shows the refund state when there is money to give back; the
//    dedicated refund email follows once Stripe confirms it.
// ============================================================
export function buildOrderCancelledEmail(
  brand: OrderEmailBrand,
  order: OrderEmailData,
): OrderEmailTemplate {
  const refundBox =
    order.refundStatus && (order.refundAmount ?? 0) > 0
      ? calloutBox(
          "Refund",
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
             <tr>
               <td style="font-family:${FONT};font-size:14px;color:${DEEP};padding:2px 0">Refund Status</td>
               <td align="right" style="font-family:${FONT};font-size:14px;font-weight:700;color:${ACCENT};padding:2px 0">${esc(order.refundStatus)}</td>
             </tr>
             <tr>
               <td style="font-family:${FONT};font-size:14px;color:${DEEP};padding:2px 0">Refund Amount</td>
               <td align="right" style="font-family:${FONT};font-size:14px;font-weight:700;color:${ACCENT};padding:2px 0">${money(order.refundAmount ?? 0)}</td>
             </tr>
             ${
               order.refundEta
                 ? `<tr><td colspan="2" style="font-family:${FONT};font-size:13px;color:${MUTED};padding:8px 0 0;line-height:1.6">Refund Progress: sent back to your original payment method — typically ${esc(order.refundEta)}.</td></tr>`
                 : ""
             }
           </table>`,
        )
      : "";

  const body = `
    ${intro(
      order.customerName,
      "Your order has been cancelled",
      `Unfortunately your order has been cancelled.<br/><br/>
       If a refund is applicable, it is currently being processed. Please contact us if you have any questions.`,
    )}

    ${sectionTitle("Order Details")}
    ${detailGrid([
      ["Order Number", order.orderNumber],
      ["Cancellation Date", order.cancelledAt ?? ""],
      ["Order Status", order.orderStatus],
      ["Total Paid", money(order.total)],
      ["Cancellation Reason", order.cancellationReason ?? ""],
    ])}

    ${refundBox}
    ${addressBlock(order)}

    ${sectionTitle("Cancelled Items")}
    ${itemsTable(order.items)}
    ${totalsTable(order)}

    ${actionRow(brand)}`;

  return {
    subject: "Your Order Has Been Cancelled",
    html: shell({
      brand,
      title: `Order ${order.orderNumber} cancelled`,
      preheader: `Order ${order.orderNumber} has been cancelled.`,
      statusLabel: "Order Status",
      statusValue: order.orderStatus,
      statusTone: "grey",
      bodyHtml: body,
    }),
  };
}

// ============================================================
// 4. REFUND PROCESSED — sent ONLY after Stripe confirms the refund.
// ============================================================
export function buildOrderRefundedEmail(
  brand: OrderEmailBrand,
  order: OrderEmailData,
): OrderEmailTemplate {
  const amount = order.refundAmount ?? order.total;

  const body = `
    ${intro(
      order.customerName,
      "Your refund has been processed",
      `We've successfully processed your refund.<br/><br/>
       Depending on your bank, it may take several business days before the funds appear in your account.`,
    )}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0">
      <tr>
        <td align="center" style="background:${BLUSH};border-radius:16px;padding:22px 18px">
          <div style="font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:${ACCENT}">Refund Amount</div>
          <div style="font-family:${FONT};font-size:34px;font-weight:800;color:${WINE};margin-top:6px;line-height:1.2">${money(amount)}</div>
        </td>
      </tr>
    </table>

    ${sectionTitle("Refund Details")}
    ${detailGrid([
      ["Order Number", order.orderNumber],
      ["Refund Status", order.refundStatus ?? "Refunded"],
      ["Payment Method", order.paymentMethod],
      ["Expected Processing Time", order.refundEta ?? "5–10 business days"],
    ])}

    ${actionRow(brand)}`;

  return {
    subject: "Your Refund Has Been Processed",
    html: shell({
      brand,
      title: `Refund processed for order ${order.orderNumber}`,
      preheader: `${money(amount)} is on its way back to you.`,
      statusLabel: "Refund Status",
      statusValue: order.refundStatus ?? "Refunded",
      statusTone: "green",
      bodyHtml: body,
    }),
  };
}
