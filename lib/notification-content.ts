// ============================================================
// Le Rasa Bakery — OWNER notification CONTENT (WhatsApp)
// ------------------------------------------------------------
// What an order looks like when the OWNER reads it on WhatsApp: the cake, its
// accessories, every message and note, the quantities and the total — plus the
// short lifecycle notices (cancelled / auto-cancelled / refund completed).
//
// The CUSTOMER's four order emails used to live here too; they now belong to
// lib/order-email-templates.ts, which gives all of them one design system and
// one duplicate guard. Nothing in this file emails anyone.
//
// Deliberately PURE and dependency-free (no crypto, no network, no Supabase),
// so the wording can be exercised on its own. lib/notifications.ts owns the
// credentials and the sending; this file owns the words.
// ============================================================

import { money } from "@/lib/pricing";
import { lineText, type CustomizationLine } from "@/lib/customization";
import { PENDING_AUTO_CANCEL_LABEL } from "@/lib/order-timeout";

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
// LIFECYCLE EVENT messages — short status-change notices sent to the OWNER
// as the order moves through the approval workflow. Deliberately lightweight
// (no line items): the full breakdown already went out with buildWhatsAppText
// when the order was placed.
// ============================================================

export type LifecycleEvent =
  | "accepted"          // owner accepted → order is now Received
  | "cancelled"         // customer cancelled while Pending (refund issued)
  | "auto_cancelled"    // owner didn't accept before the deadline (refund issued)
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
      return `*Order ${order.orderNumber} auto-cancelled* (not accepted within ${PENDING_AUTO_CANCEL_LABEL}).\n${refund}`;
    case "refund_completed":
      return `*Refund completed* for order ${order.orderNumber} — ${money(order.total)}.`;
    case "accepted":
      return `Order ${order.orderNumber} accepted.`;
  }
}
