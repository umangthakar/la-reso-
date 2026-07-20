// ============================================================
// Le Rasa Bakery — owner "New Custom Cake Inquiry" email template.
// ------------------------------------------------------------
// Pure HTML builder (no side effects), used by /api/inquiry/create together
// with the reusable email service (lib/email). Inline styles only, so it
// renders consistently across email clients.
// ============================================================

const WINE = "#873853";
const BERRY = "#5C2A41";
const BLUSH = "#F9EEEA";

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

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

function row(label: string, value: string): string {
  if (!value.trim()) return "";
  return `<tr>
    <td style="padding:7px 14px;color:${WINE};font-weight:600;white-space:nowrap;vertical-align:top;border-bottom:1px solid #F0DCD5">${esc(label)}</td>
    <td style="padding:7px 14px;color:${BERRY};border-bottom:1px solid #F0DCD5">${esc(value)}</td>
  </tr>`;
}

function button(href: string, label: string, filled: boolean): string {
  const style = filled
    ? `background:${WINE};color:#ffffff;border:1px solid ${WINE}`
    : `background:#ffffff;color:${WINE};border:1px solid ${WINE}`;
  return `<a href="${esc(href)}" style="display:inline-block;padding:11px 22px;border-radius:999px;font-weight:700;text-decoration:none;font-size:14px;${style}">${esc(label)}</a>`;
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
<html>
<body style="margin:0;padding:0;background:${BLUSH};font-family:Segoe UI,system-ui,-apple-system,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BLUSH};padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(135,56,83,0.10)">
        <tr>
          <td style="background:${WINE};padding:22px 28px">
            <div style="color:#ffffff;font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:0.85">Le Rasa Bakery</div>
            <div style="color:#ffffff;font-size:22px;font-weight:800;margin-top:4px">New Custom Cake Inquiry</div>
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
            ${button(links.viewUrl, "View Inquiry", true)}
            &nbsp;
            ${button(links.adminUrl, "Open Admin", false)}
          </td>
        </tr>
      </table>
      <div style="color:#9C616D;font-size:12px;margin-top:14px">Le Rasa Bakery — 100% Eggless</div>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: "New Custom Cake Inquiry", html };
}
