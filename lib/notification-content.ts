// ============================================================
// Le Rasa Bakery — notification CONTENT
// ------------------------------------------------------------
// What an order looks like when a person reads it: the customer's email and
// the owner's WhatsApp message. Both list the cake, its accessories, every
// message and note, the quantities and the total.
//
// Deliberately PURE and dependency-free (no crypto, no network, no Supabase),
// so the wording can be exercised on its own. lib/notifications.ts owns the
// credentials and the sending; this file owns the words.
// ============================================================

import { money } from "@/lib/pricing";
import { lineText, type CustomizationLine } from "@/lib/customization";

export type NotifyItem = {
  name: string;
  quantity: number;
  /** Base product price per unit. */
  unitPrice: number;
  /** Accessory extra per unit. */
  addons: number;
  lines: CustomizationLine[];
};

export type NotifyOrder = {
  orderNumber: string;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  deliveryDate: string;
  specialInstructions: string;
  items: NotifyItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
};

/** One accessory, as "Candles: Sparkler × 2 (+£6.00)". */
function accessoryText(lines: CustomizationLine[]): string[] {
  return lines.map((l) => {
    const price = l.price > 0 ? ` (+${money(l.price)})` : "";
    return `${l.label}: ${lineText(l)}${price}`;
  });
}

/** Escape anything the customer typed before it lands in an HTML email. */
function esc(raw: string): string {
  return String(raw)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The owner's WhatsApp message: order number, customer, cake, accessories,
 * messages, total. Plain text — WhatsApp renders *bold* from asterisks.
 */
export function buildWhatsAppText(order: NotifyOrder): string {
  const parts: string[] = [
    `*New order ${order.orderNumber}*`,
    "",
    `*Customer:* ${order.customerName}`,
    `*Phone:* ${order.phone || "—"}`,
    `*Delivery:* ${order.deliveryDate || "—"}`,
  ];
  if (order.address) parts.push(`*Address:* ${order.address}`);
  parts.push("");

  for (const item of order.items) {
    parts.push(
      `*${item.quantity} × ${item.name}* — ${money(
        (item.unitPrice + item.addons) * item.quantity,
      )}`,
    );
    for (const line of accessoryText(item.lines)) parts.push(`  • ${line}`);
  }

  if (order.specialInstructions) {
    parts.push("", `*Notes:* ${order.specialInstructions}`);
  }
  parts.push("", `*Total paid: ${money(order.total)}*`);

  return parts.join("\n");
}

/** The customer's email: cake, accessories, messages, notes, totals. */
export function buildEmailHtml(order: NotifyOrder): string {
  const rows = order.items
    .map((item) => {
      const accessories = item.lines.length
        ? `<ul style="margin:6px 0 0;padding-left:18px;color:#9C616D;font-size:13px">${item.lines
            .map(
              (l) =>
                `<li>${esc(l.label)}: <strong style="color:#612437">${esc(
                  lineText(l),
                )}</strong>${l.price > 0 ? ` (+${money(l.price)})` : ""}</li>`,
            )
            .join("")}</ul>`
        : "";
      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #F2DCD6">
            <strong style="color:#612437">${item.quantity} × ${esc(item.name)}</strong>
            ${accessories}
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #F2DCD6;text-align:right;color:#743249;font-weight:700;white-space:nowrap">
            ${money((item.unitPrice + item.addons) * item.quantity)}
          </td>
        </tr>`;
    })
    .join("");

  const totalRow = (label: string, value: string, bold = false) => `
    <tr>
      <td style="padding:4px 0;color:${bold ? "#612437" : "#9C616D"};${
        bold ? "font-weight:700" : ""
      }">${label}</td>
      <td style="padding:4px 0;text-align:right;color:#743249;${
        bold ? "font-weight:700;font-size:18px" : ""
      }">${value}</td>
    </tr>`;

  return `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#FDF8F6;padding:28px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;padding:28px">
      <h1 style="margin:0;color:#873853;font-size:22px">Thank you, ${esc(
        order.customerName || "there",
      )}!</h1>
      <p style="color:#9C616D;font-size:14px;margin:8px 0 0">
        Your order <strong style="color:#612437">${esc(
          order.orderNumber,
        )}</strong> is in the book. We'll have it ready for
        <strong style="color:#612437">${esc(
          order.deliveryDate || "your chosen date",
        )}</strong>.
      </p>

      <table style="width:100%;border-collapse:collapse;margin-top:20px">${rows}</table>

      <table style="width:100%;border-collapse:collapse;margin-top:14px">
        ${totalRow("Subtotal", money(order.subtotal))}
        ${order.discount > 0 ? totalRow("Discount", `−${money(order.discount)}`) : ""}
        ${totalRow("Delivery", order.deliveryFee === 0 ? "Free" : money(order.deliveryFee))}
        ${totalRow("Total", money(order.total), true)}
      </table>

      ${
        order.specialInstructions
          ? `<div style="margin-top:18px;background:#F9EEEA;border-radius:12px;padding:14px">
               <p style="margin:0;font-size:12px;font-weight:700;color:#743249;text-transform:uppercase">Your notes</p>
               <p style="margin:6px 0 0;color:#612437;font-size:14px">${esc(
                 order.specialInstructions,
               )}</p>
             </div>`
          : ""
      }

      ${
        order.address
          ? `<p style="margin:18px 0 0;color:#9C616D;font-size:13px">Delivering to: ${esc(
              order.address,
            )}</p>`
          : ""
      }

      <p style="margin:22px 0 0;color:#9C616D;font-size:12px">
        Baked eggless, with love. — Le Rasa
      </p>
    </div>
  </div>`;
}
