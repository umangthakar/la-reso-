// ============================================================
// ntfy push notifications (SERVER ONLY).
// Sends the owner an instant push the moment a new order is saved.
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

/**
 * Push a "New Order Received" notification to the owner's phone via ntfy.
 *
 * Best-effort by design: a missing config or a failed request is logged, never
 * thrown-through in a way that could block checkout. The caller also wraps this
 * in try/catch per the integration contract.
 */
export async function sendOrderNotification(order: OrderNotification): Promise<void> {
  // Read at call time (not module load) so a missing var can never break the
  // build, only skip the notification.
  const url = (process.env.NTFY_URL ?? "").trim().replace(/\/+$/, "");
  const topic = (process.env.NTFY_TOPIC ?? "").trim();

  // --- TEMPORARY DIAGNOSTIC LOGS (see if this runs + what config it sees) ---
  console.log("[ntfy] sending notification");
  console.log("[ntfy] URL:", process.env.NTFY_URL);
  console.log("[ntfy] Topic:", process.env.NTFY_TOPIC);

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

  // Official ntfy publish format: POST to `<server>/<topic>` with metadata in
  // headers and the message as the UTF-8 text/plain body.
  const endpoint = `${url}/${topic}`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        Title: utf8Header("🎂 Le Rasa Bakery"),
        Priority: "max",
        Tags: "cake,shopping_cart",
        Click: CLICK_URL,
      },
      body: message,
      // NOTE: AbortSignal.timeout() removed temporarily to rule out any runtime
      // compatibility issue while diagnosing.
    });

    const responseBody = await res.text().catch(() => "");
    console.log("[ntfy] response.status:", res.status);
    console.log("[ntfy] response.statusText:", res.statusText);
    console.log("[ntfy] response body:", responseBody);

    if (!res.ok) {
      console.error("[ntfy] push failed — full response body:", responseBody);
    }
  } catch (err) {
    // fetch itself threw (DNS, TLS, network, invalid header, etc.).
    console.error("[ntfy] fetch threw:", err);
  }
}
