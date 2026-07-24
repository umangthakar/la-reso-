// ============================================================
// ntfy push notifications (SERVER ONLY).
// Sends the owner an instant push the moment a new order is saved.
// Config comes solely from env (NTFY_URL + NTFY_TOPIC) — never hardcoded,
// never NEXT_PUBLIC, so the topic/credentials never reach the browser.
//
// Publishing uses ntfy's JSON endpoint (POST the server root with the topic
// in the body) rather than HTTP headers, because headers are Latin-1 only and
// would mangle the emoji in the title/message.
// ============================================================

const CLICK_URL = "https://www.lerasa.co.uk/admin/orders";

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
 * Push a "New Order Received" notification to the owner's phone via ntfy.
 *
 * Best-effort by design: a missing config or a failed/slow request resolves
 * quietly (logged, never thrown-through in a way that could block checkout).
 * The caller still wraps this in try/catch per the integration contract.
 */
export async function sendOrderNotification(order: OrderNotification): Promise<void> {
  // Read at call time (not module load) so a missing var can never break the
  // build, only skip the notification.
  const url = (process.env.NTFY_URL ?? "").trim().replace(/\/+$/, "");
  const topic = (process.env.NTFY_TOPIC ?? "").trim();

  if (!url || !topic) {
    console.warn("[ntfy] NTFY_URL / NTFY_TOPIC not set — skipping order push.");
    return;
  }

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

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic,
      title: "🎂 Le Rasa Bakery",
      message,
      priority: 5,
      tags: ["cake", "shopping_cart"],
      click: CLICK_URL,
    }),
    // Never let a hanging ntfy server delay the checkout response.
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[ntfy] push failed: ${res.status} ${res.statusText} ${detail}`.trim());
  }
}
