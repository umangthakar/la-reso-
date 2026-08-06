// ============================================================
// Le Rasa — owner "New Custom Cake Inquiry" email template.
// ------------------------------------------------------------
// Pure HTML builder (no side effects), used by /api/inquiry/create together
// with the reusable email service (lib/email). Inline styles only, so it
// renders consistently across email clients.
//
// Brand (wordmark + tagline) and buttons come from lib/email-brand, the same
// shared source the auth and order emails use.
// ============================================================

import {
  EMAIL_COLORS,
  emailBrandLockup,
  emailBrandSignature,
  emailButton,
  escapeEmailText,
} from "@/lib/email-brand";

const WINE = EMAIL_COLORS.wine;
const BERRY = EMAIL_COLORS.berry;
const BLUSH = EMAIL_COLORS.blush;

export type InquiryEmailData = {
  inquiryNumber: string;
  name: string;
  phone: string;
  email: string;
  eventType: string;
  deliveryDate: string;
  budget: string;
  servings: string;
  flavour: string;
  shape: string;
  colourTheme: string;
  cakeMessage: string;
  notes: string;
  images: string[];
};

const esc = escapeEmailText;

function row(label: string, value: string): string {
  if (!value.trim()) return "";
  return `<tr>
    <td class="lbl" style="padding:7px 14px;color:${WINE};font-weight:600;white-space:nowrap;vertical-align:top;border-bottom:1px solid #F0DCD5">${esc(label)}</td>
    <td style="padding:7px 14px;color:${BERRY};border-bottom:1px solid #F0DCD5">${esc(value)}</td>
  </tr>`;
}

/** The shared CTA helper, left-aligned like the rest of this email. */
function button(href: string, label: string, filled: boolean): string {
  return emailButton(href, label, {
    variant: filled ? "primary" : "ghost",
    align: "left",
  });
}

/**
 * Build the owner notification email. `viewUrl` deep-links to the inquiry in
 * the admin panel; `adminUrl` opens the admin dashboard.
 */
export function buildInquiryOwnerEmail(
  data: InquiryEmailData,
  links: { viewUrl: string; adminUrl: string },
): { subject: string; html: string } {
  const rows =
    row("Inquiry Number", data.inquiryNumber) +
    row("Customer Name", data.name) +
    row("Phone", data.phone) +
    row("Email", data.email) +
    row("Event Type", data.eventType) +
    row("Delivery Date", data.deliveryDate) +
    row("Budget", data.budget) +
    row("Servings", data.servings) +
    row("Flavour", data.flavour) +
    row("Shape", data.shape) +
    row("Colour Theme", data.colourTheme) +
    row("Cake Message", data.cakeMessage) +
    row("Additional Notes", data.notes);

  const images = data.images.length
    ? `<div style="margin:20px 0 4px;color:${WINE};font-weight:700;font-size:14px">Uploaded Images</div>
       <div>${data.images
         .map(
           (u) =>
             `<a href="${esc(u)}" style="display:inline-block;margin:6px 6px 0 0"><img src="${esc(u)}" alt="Reference" width="96" height="96" style="width:96px;height:96px;object-fit:cover;border-radius:10px;border:1px solid #E4C3BC" /></a>`,
         )
         .join("")}</div>
       <div style="margin-top:6px">${data.images
         .map((u) => `<a href="${esc(u)}" style="color:${WINE};font-size:12px;word-break:break-all">${esc(u)}</a>`)
         .join("<br/>")}</div>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  /* Progressive enhancement only — the inline styles already render correctly
     without this block. On a phone the two action buttons stack instead of
     sitting side by side, and the detail labels are allowed to wrap: their
     nowrap gives the table a min-content width wider than a 320px screen,
     which made the whole email scroll sideways. */
  @media only screen and (max-width:420px) {
    .btn-stack { display:block !important; width:100% !important; padding:0 0 10px !important; }
    .lbl { white-space:normal !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BLUSH};font-family:Segoe UI,system-ui,-apple-system,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BLUSH};padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(135,56,83,0.10)">
        <tr>
          <td style="background:${WINE};padding:22px 28px">
            ${emailBrandLockup({ size: "sm", align: "left" })}
            <div style="color:#ffffff;font-size:22px;font-weight:800;margin-top:12px">New Custom Cake Inquiry</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px 8px">
            <div style="display:inline-block;background:${BLUSH};border-radius:10px;padding:10px 16px">
              <span style="color:${WINE};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Inquiry Number</span><br/>
              <span style="color:${BERRY};font-size:20px;font-weight:800">${esc(data.inquiryNumber)}</span>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 28px 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">${rows}</table>
            ${images}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px 28px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="btn-stack" valign="top" style="padding:0 10px 0 0">${button(links.viewUrl, "View Inquiry", true)}</td>
                <td class="btn-stack" valign="top">${button(links.adminUrl, "Open Admin", false)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <div style="color:#9C616D;font-size:12px;margin-top:14px">${esc(emailBrandSignature())}</div>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: "New Custom Cake Inquiry", html };
}
