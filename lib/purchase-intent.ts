// ============================================================
// Le Rasa Bakery — pending purchase intent
// ------------------------------------------------------------
// When a signed-out customer hits "Buy Now" (or Checkout) we stash what
// they were trying to buy, send them to Google login, and replay it when
// they come back. sessionStorage survives the full-page OAuth round-trip
// in the same tab, and dies with the tab — so a stale intent can never
// hijack a later visit.
// ============================================================

export type PurchaseIntent = {
  /** What the customer was doing when the gate stopped them. */
  action: "buy-now" | "checkout";
  /** Product identity — present for "buy-now". */
  productId?: string;
  slug?: string;
  /** Reserved for future product options; the catalogue has none today. */
  variant?: string | null;
  quantity?: number;
  /** Where to send them back to after login (the product they clicked). */
  href: string;
  ts: number;
};

const KEY = "lerasa_purchase_intent";
/** Anything older than this is treated as abandoned. */
const MAX_AGE_MS = 30 * 60 * 1000;

export function savePurchaseIntent(
  intent: Omit<PurchaseIntent, "ts">,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ ...intent, ts: Date.now() } satisfies PurchaseIntent),
    );
  } catch {
    /* private mode / storage full — the customer just lands on the product */
  }
}

/** Read the pending intent without clearing it. */
export function peekPurchaseIntent(): PurchaseIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as PurchaseIntent).href !== "string" ||
      typeof (parsed as PurchaseIntent).ts !== "number"
    ) {
      return null;
    }
    const intent = parsed as PurchaseIntent;
    if (Date.now() - intent.ts > MAX_AGE_MS) {
      clearPurchaseIntent();
      return null;
    }
    return intent;
  } catch {
    return null;
  }
}

export function clearPurchaseIntent(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}

/** Read and clear in one go — use when replaying the intent. */
export function consumePurchaseIntent(): PurchaseIntent | null {
  const intent = peekPurchaseIntent();
  if (intent) clearPurchaseIntent();
  return intent;
}

/** The login URL that will bring the customer back to `href`. */
export function loginHrefFor(href: string): string {
  return `/account/login?next=${encodeURIComponent(href)}`;
}
