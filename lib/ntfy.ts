// ============================================================
// ntfy push notifications (SERVER ONLY).
// Instant pushes to the owner's phone for the two events that need one:
//
//   * a NEW ORDER was saved            → sendOrderNotification
//   * an order was CANCELLED+REFUNDED  → sendRefundNotification
//
// Config comes solely from env (NTFY_URL + NTFY_TOPIC) — never hardcoded,
// never NEXT_PUBLIC, so the topic/credentials never reach the browser.
//
// Publishing uses ntfy's officially recommended format: POST to
// `<server>/<topic>` with the notification metadata in HTTP headers
// (Title/Priority/Tags/Click) and the message as a UTF-8 text/plain body.
// ============================================================

const CLICK_URL = "https://www.lerasa.co.uk/admin/dashboard/orders";

export type OrderNotification = {
  /** order.order_number — the human-facing number quoted everywhere. */
  orderNumber: string;
  /** order.customer_name */
  customerName: string;
  /** "Paid" when the payment succeeded, otherwise "Pending". */
  paymentStatus: string;
  /** Numeric order total in GBP (e.g. 58 → "£58.00"). */
  orderTotal: number;
  /** When the order was placed. Defaults to now. */
  orderTime?: Date;
};

/** Time-only, Europe/London, 12-hour — e.g. "3:42 PM". */
function formatLondonTime(when: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Europe/London",
  }).format(when);
}

/**
 * Encode a UTF-8 header value so Node's fetch (undici) will send it.
 *
 * undici validates header values as a ByteString (Latin-1), so any character
 * above code point 255 — e.g. the 🎂 in the Title — throws
 * "Cannot convert argument to a ByteString". curl avoids this by putting the
 * raw UTF-8 bytes on the wire; we reproduce that by mapping each UTF-8 byte to
 * one Latin-1 char. ntfy decodes the header as UTF-8, so the emoji arrives intact.
 */
function utf8Header(value: string): string {
  return Buffer.from(value, "utf-8").toString("latin1");
}

type NtfyPush = {
  /** Notification title (shows as the heading on the phone). */
  title: string;
  /** The message body, plain UTF-8 text. */
  body: string;
  /** ntfy priority — "max" for anything the owner must see now. */
  priority: "max" | "high" | "default";
  /** Comma-separated ntfy tag names (emoji shortcodes). */
  tags: string;
};

/**
 * The single ntfy transport. Reads config, posts, logs the outcome.
 *
 * Best-effort by design and NEVER throws: a missing config or a failed
 * request is logged, never propagated, because every caller is doing
 * something more important than the push (taking a payment, issuing a
 * refund) that must not fail because a phone notification didn't land.
 *
 * `label` identifies the caller in the logs, e.g. "order" / "refund".
 */
async function publish(label: string, push: NtfyPush): Promise<void> {
  // Read at call time (not module load) so a missing var can never break the
  // build, only skip the notification.
  const url = (process.env.NTFY_URL ?? "").trim().replace(/\/+$/, "");
  const topic = (process.env.NTFY_TOPIC ?? "").trim();

  if (!url || !topic) {
    console.warn(`[ntfy:${label}] NTFY_URL / NTFY_TOPIC not set — skipping push.`);
    return;
  }

  // Official ntfy publish format: POST to `<server>/<topic>` with metadata in
  // headers and the message as the UTF-8 text/plain body.
  const endpoint = `${url}/${topic}`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        Title: utf8Header(push.title),
        Priority: push.priority,
        Tags: push.tags,
        Click: CLICK_URL,
      },
      body: push.body,
      // Bounded so a hung ntfy server cannot hold a serverless invocation
      // open — the hourly sweep may send several of these in one run.
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[ntfy:${label}] push failed — ${res.status}: ${detail.slice(0, 300)}`);
    }
  } catch (err) {
    // fetch itself threw (DNS, TLS, network, timeout, invalid header, etc.).
    console.error(`[ntfy:${label}] fetch threw:`, err);
  }
}

/**
 * Push a "New Order Received" notification to the owner's phone via ntfy.
 *
 * Best-effort by design: a missing config or a failed request is logged, never
 * thrown-through in a way that could block checkout. The caller also wraps this
 * in try/catch per the integration contract.
 */
export async function sendOrderNotification(order: OrderNotification): Promise<void> {
  const total = `£${(Number(order.orderTotal) || 0).toFixed(2)}`;
  const time = formatLondonTime(order.orderTime ?? new Date());

  const message = [
    "🛒 New Order Received",
    "",
    `Order #${order.orderNumber}`,
    "",
    `👤 ${order.customerName}`,
    "",
    `💳 ${order.paymentStatus}`,
    "",
    `💷 ${total}`,
    "",
    `🕒 ${time}`,
    "",
    "Tap to open Admin Panel →",
  ].join("\n");

  await publish("order", {
    title: "🎂 Le Rasa Bakery",
    body: message,
    priority: "max",
    tags: "cake,shopping_cart",
  });
}

export type RefundNotification = {
  /** The customer-facing order number (orderNumberOf(order.id)). */
  orderNumber: string;
  /** order.customer_name */
  customerName: string;
  /** Numeric order total in GBP — the amount refunded. */
  orderTotal: number;
  /** Who triggered the cancellation. 'auto' = the 24h sweep. */
  by: "customer" | "auto" | "admin";
  /**
   * 'refunded'      — Stripe confirmed the refund, nothing to do.
   * 'refund_pending'— Stripe REFUSED it; the owner must refund by hand.
   */
  refundState: "refunded" | "refund_pending";
  /** Stripe's reason, when refundState is 'refund_pending'. */
  refundError?: string;
  /** When it happened. Defaults to now. */
  when?: Date;
};

const CANCELLED_BY_LABEL: Record<RefundNotification["by"], string> = {
  auto: "Auto-cancelled (not accepted within 24h)",
  customer: "Cancelled by customer",
  admin: "Cancelled by admin",
};

/**
 * Push a "cancelled + refunded" notification to the owner's phone.
 *
 * Sent for every cancellation path, so the owner learns about money leaving
 * the account the moment it happens rather than at the next dashboard visit.
 *
 * A FAILED refund is the more urgent message of the two: it is titled as an
 * action item and carries Stripe's reason, because that order needs a manual
 * refund. Same best-effort contract as sendOrderNotification — never throws.
 */
export async function sendRefundNotification(refund: RefundNotification): Promise<void> {
  const failed = refund.refundState === "refund_pending";
  const total = `£${(Number(refund.orderTotal) || 0).toFixed(2)}`;
  const time = formatLondonTime(refund.when ?? new Date());

  const message = [
    failed ? "⚠️ Refund FAILED — action needed" : "↩️ Order Cancelled & Refunded",
    "",
    `Order #${refund.orderNumber}`,
    "",
    `👤 ${refund.customerName || "—"}`,
    "",
    `💷 ${total}`,
    "",
    `📋 ${CANCELLED_BY_LABEL[refund.by]}`,
    "",
    failed
      ? `❌ Stripe: ${refund.refundError || "refund could not be issued"}`
      : "✅ Refund issued via Stripe",
    "",
    `🕒 ${time}`,
    "",
    failed ? "Refund this order manually in Stripe →" : "Tap to open Admin Panel →",
  ].join("\n");

  await publish("refund", {
    title: failed ? "⚠️ Le Rasa — Refund Failed" : "🎂 Le Rasa Bakery",
    body: message,
    priority: "max",
    tags: failed ? "warning,rotating_light" : "leftwards_arrow_with_hook,pound",
  });
}
