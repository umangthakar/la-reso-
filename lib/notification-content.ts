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

// ============================================================
// LIFECYCLE EVENT messages — short status-change notices sent as the
// order moves through the approval workflow. These are deliberately
// lightweight (no line items) — the full order breakdown already went
// out with buildEmailHtml / buildWhatsAppText when the order was placed.
// ============================================================

export type LifecycleEvent =
  | "accepted"          // owner accepted → order is now Received
  | "cancelled"         // customer cancelled while Pending (refund issued)
  | "auto_cancelled"    // owner didn't accept within 24h (refund issued)
  | "refund_completed"; // a previously-pending refund succeeded on retry

/** The minimal order facts an event message needs. */
export type LifecycleOrder = {
  orderNumber: string;
  customerName: string;
  email: string;
  total: number;
  /** 'refunded' when the refund is done, 'refund_pending' when it failed. */
  refundState?: "refunded" | "refund_pending";
};

/** Customer-facing subject + HTML for one lifecycle event. */
export function buildEventEmail(
  event: LifecycleEvent,
  order: LifecycleOrder,
): { subject: string; html: string } {
  const num = esc(order.orderNumber);
  const name = esc(order.customerName || "there");
  const refundLine =
    order.refundState === "refund_pending"
      ? `We've started your refund of <strong style="color:#612437">${money(
          order.total,
        )}</strong>. It's taking a moment to process — you'll see it back on your card shortly.`
      : `A full refund of <strong style="color:#612437">${money(
          order.total,
        )}</strong> is on its way back to your card.`;

  const copy: Record<LifecycleEvent, { subject: string; heading: string; body: string }> = {
    accepted: {
      subject: `Your Le Rasa order ${order.orderNumber} is confirmed`,
      heading: `We're on it, ${name}!`,
      body: `Great news — your order <strong style="color:#612437">${num}</strong> has been accepted and we've started getting everything ready. We'll keep you posted as it moves along.`,
    },
    cancelled: {
      subject: `Your Le Rasa order ${order.orderNumber} has been cancelled`,
      heading: `Order cancelled, ${name}`,
      body: `Your order <strong style="color:#612437">${num}</strong> has been cancelled as requested. ${refundLine}`,
    },
    auto_cancelled: {
      subject: `Your Le Rasa order ${order.orderNumber} has been cancelled`,
      heading: `We're sorry, ${name}`,
      body: `We weren't able to confirm your order <strong style="color:#612437">${num}</strong> in time, so it has been cancelled automatically. ${refundLine}`,
    },
    refund_completed: {
      subject: `Refund completed for Le Rasa order ${order.orderNumber}`,
      heading: `Your refund is complete, ${name}`,
      body: `The refund for your cancelled order <strong style="color:#612437">${num}</strong> — <strong style="color:#612437">${money(
        order.total,
      )}</strong> — has now been processed back to your card.`,
    },
  };

  const c = copy[event];
  const html = `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#FDF8F6;padding:28px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;padding:28px">
      <h1 style="margin:0;color:#873853;font-size:22px">${c.heading}</h1>
      <p style="color:#9C616D;font-size:14px;margin:14px 0 0;line-height:1.6">${c.body}</p>
      <p style="margin:22px 0 0;color:#9C616D;font-size:12px">Baked eggless, with love. — Le Rasa</p>
    </div>
  </div>`;
  return { subject: c.subject, html };
}

/** Owner-facing WhatsApp text for one lifecycle event. */
export function buildEventWhatsApp(event: LifecycleEvent, order: LifecycleOrder): string {
  const refund =
    order.refundState === "refund_pending"
      ? `Refund of ${money(order.total)} is PENDING — retry it from the admin panel.`
      : `Refund of ${money(order.total)} issued.`;
  switch (event) {
    case "cancelled":
      return `*Order ${order.orderNumber} cancelled by ${order.customerName}.*\n${refund}`;
    case "auto_cancelled":
      return `*Order ${order.orderNumber} auto-cancelled* (not accepted within 24h).\n${refund}`;
    case "refund_completed":
      return `*Refund completed* for order ${order.orderNumber} — ${money(order.total)}.`;
    case "accepted":
      return `Order ${order.orderNumber} accepted.`;
  }
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
