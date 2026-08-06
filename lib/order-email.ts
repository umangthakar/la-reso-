// ============================================================
// SERVER-ONLY — the SINGLE implementation of "email the customer about
// their order".
// ------------------------------------------------------------
// Four functions, one per lifecycle moment:
//
//   sendOrderPlacedEmail()     Stripe succeeded AND the order row exists
//   sendOrderAcceptedEmail()   pending → received (the owner accepted it)
//   sendOrderCancelledEmail()  cancelled by admin / customer / the sweep
//   sendOrderRefundedEmail()   Stripe CONFIRMED the refund
//
// WHY IT ALL LIVES HERE. The same email used to be assembled in three
// different places with three different levels of detail, which is how a
// customer ends up with two confirmations for one order — or none. Everything
// that emails a customer about an order now calls one of the four functions
// above, and each of them:
//
//   1. RE-READS THE ORDER FROM THE DATABASE. Callers pass an id, never a
//      payload. What the customer reads is therefore exactly what was saved:
//      the same items, the same money, the same address the admin panel and
//      the baker see. Nothing is hardcoded and nothing can drift.
//   2. CLAIMS THE SEND (lib duplicate guard, supabase/sql/45). One email per
//      (order, type), ever — see claimEmail below.
//   3. REUSES THE EXISTING TRANSPORT. The admin-configured Resend credentials
//      first (lib/notifications.sendConfiguredEmail — the same credentials the
//      owner's notifications already use), falling back to the env-var Resend
//      client (lib/email.sendEmail). No third Resend client exists.
//   4. NEVER THROWS. Every function resolves with an outcome. A missing key,
//      a Resend outage, a database that predates the ledger — all of them are
//      a log line and a returned value. Checkout, Stripe, the admin panel and
//      the refund path must never fail because an email didn't send.
//
// The WORDS and the LAYOUT live in lib/order-email-templates.ts (pure); this
// file owns the data, the credentials, the sending and the idempotency.
// NEVER import from the browser.
// ============================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/pricing";
import { lineText, type CustomizationLine } from "@/lib/customization";
import { getPublicSettings } from "@/lib/site-settings-server";
import { instagramUrl } from "@/lib/site-settings";
import { absoluteUrl, siteUrl } from "@/lib/site-url";
import { sendConfiguredEmail } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import {
  buildOrderAcceptedEmail,
  buildOrderCancelledEmail,
  buildOrderPlacedEmail,
  buildOrderRefundedEmail,
  type OrderEmailBrand,
  type OrderEmailData,
  type OrderEmailItem,
  type OrderEmailTemplate,
} from "@/lib/order-email-templates";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

/** The four emails. Also the `email_type` value stored in the ledger. */
export type OrderEmailType =
  | "order_placed"
  | "order_accepted"
  | "order_cancelled"
  | "order_refunded";

export type OrderEmailOutcome = {
  type: OrderEmailType;
  /**
   * sent      — Resend accepted it
   * duplicate — this email already went out for this order; nothing was sent
   * skipped   — nothing to send to (no order, no recipient, no provider)
   * failed    — the send was attempted and failed (re-claimable)
   */
  status: "sent" | "duplicate" | "skipped" | "failed";
  error?: string;
};

/** Who cancelled the order — drives the customer-facing reason line. */
export type CancelledBy = "customer" | "admin" | "auto";

/** How long a card refund typically takes to land, in the customer's words. */
const REFUND_ETA = "5–10 business days";

// ------------------------------------------------------------
// Duplicate protection
// ------------------------------------------------------------

/**
 * Last-resort, PER-PROCESS guard used only when order_email_log is absent
 * (supabase/sql/45 not run). It stops the obvious double-fire inside one
 * instance; it CANNOT stop two serverless invocations sending the same email,
 * which is precisely why the real guard is a database primary key.
 */
const inProcessSent = new Set<string>();

/** Ceiling on the fallback guard, so a long-lived process on an unmigrated
 *  database cannot grow it without bound. Reaching it clears the set: the
 *  worst case is one repeat email after tens of thousands of orders on a
 *  database that is missing its migration, which beats leaking memory. */
const IN_PROCESS_GUARD_LIMIT = 5000;

function guardKey(orderId: string, type: OrderEmailType): string {
  return `${orderId}:${type}`;
}

function rememberInProcess(key: string): void {
  if (inProcessSent.size >= IN_PROCESS_GUARD_LIMIT) inProcessSent.clear();
  inProcessSent.add(key);
}

/** True when a statement failed because order_email_log doesn't exist yet. */
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  // 42P01 = undefined_table; PGRST205 = not in PostgREST's schema cache.
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  return /relation .* does not exist|could not find the table/i.test(err.message ?? "");
}

/** True when an insert lost the race on the (order_id, email_type) key. */
function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return /duplicate key value|unique constraint/i.test(err.message ?? "");
}

type Claim = "claimed" | "duplicate" | "unavailable";

/**
 * Claim the right to send ONE email for this order.
 *
 * The PRIMARY KEY on (order_id, email_type) is the guard: the first INSERT
 * wins, and every other caller — a retried admin request, an overlapping
 * auto-cancel sweep, the browser and the Stripe webhook writing the same
 * order — gets 23505 and returns 'duplicate' without sending anything.
 *
 * The ONE case that may re-claim is a row left at status='failed' by an
 * earlier attempt that genuinely didn't deliver. That re-claim is itself a
 * conditional UPDATE guarded on `status = 'failed'`, so two retries racing
 * each other still produce exactly one send.
 *
 * Returns 'unavailable' when the ledger table hasn't been migrated yet, which
 * degrades to the in-process guard rather than blocking the email.
 */
async function claimEmail(
  supabase: SupabaseClient,
  orderId: string,
  type: OrderEmailType,
  recipient: string,
): Promise<Claim> {
  const { error } = await supabase.from("order_email_log").insert({
    order_id: orderId,
    email_type: type,
    recipient,
    status: "pending",
  });

  if (!error) return "claimed";
  if (isMissingTable(error)) return "unavailable";

  if (!isUniqueViolation(error)) {
    // An unexpected ledger failure must not cost the customer their email —
    // but it also must not silently disable the duplicate guard, so it is
    // logged loudly and treated like a missing table.
    console.error("[order-email] could not claim %s for order %s: %s", type, orderId, error.message);
    return "unavailable";
  }

  // A row already exists. Only a previously FAILED attempt may be retried.
  const { data: existing } = await supabase
    .from("order_email_log")
    .select("status,attempts")
    .eq("order_id", orderId)
    .eq("email_type", type)
    .maybeSingle();

  if (!existing || existing.status !== "failed") return "duplicate";

  const { data: reclaimed } = await supabase
    .from("order_email_log")
    .update({
      status: "pending",
      error: null,
      recipient,
      attempts: Number(existing.attempts ?? 1) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", orderId)
    .eq("email_type", type)
    .eq("status", "failed") // lost the race → someone else is retrying it
    .select("order_id");

  return reclaimed && reclaimed.length > 0 ? "claimed" : "duplicate";
}

/** Record the outcome on the claimed row. Best-effort — never throws. */
async function finaliseClaim(
  supabase: SupabaseClient,
  orderId: string,
  type: OrderEmailType,
  status: "sent" | "failed",
  error?: string,
): Promise<void> {
  try {
    await supabase
      .from("order_email_log")
      .update({
        status,
        error: error ? error.slice(0, 500) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId)
      .eq("email_type", type);
  } catch (e) {
    console.error("[order-email] could not record %s outcome for order %s:", type, orderId, e);
  }
}

// ------------------------------------------------------------
// Logging
// ------------------------------------------------------------

/**
 * Mask a recipient for the SUCCESS log: `j***e@gmail.com`.
 *
 * Successful sends are high-volume and land in a log an operator doesn't need
 * to act on, so the full address isn't written there (the same reasoning that
 * removed per-send diagnostics from lib/email). A FAILURE logs the address in
 * full, because knowing exactly who didn't get their confirmation is the whole
 * point of that line.
 */
function maskEmail(value: string): string {
  const [user = "", domain = ""] = String(value ?? "").split("@");
  if (!domain) return "***";
  const head = user.slice(0, 1);
  const tail = user.length > 2 ? user.slice(-1) : "";
  return `${head}***${tail}@${domain}`;
}

const LABELS: Record<OrderEmailType, string> = {
  order_placed: "Order Confirmation Email",
  order_accepted: "Accepted Email",
  order_cancelled: "Cancelled Email",
  order_refunded: "Refund Email",
};

// ------------------------------------------------------------
// Brand — resolved from the live admin settings, never hardcoded.
// ------------------------------------------------------------

/** Make a stored asset path absolute; Storage URLs already are. */
function absolutise(url: string): string {
  const v = String(url ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return absoluteUrl(v.startsWith("/") ? v : `/${v}`);
}

async function loadBrand(): Promise<OrderEmailBrand> {
  const settings = await getPublicSettings();
  const base = siteUrl();
  return {
    brandName: settings.branding.name,
    shortName: settings.branding.short_name,
    tagline: settings.branding.tagline,
    logoUrl: absolutise(settings.logo),
    siteUrl: base,
    ordersUrl: absoluteUrl("/account/orders"),
    contactUrl: absoluteUrl("/contact"),
    supportEmail: settings.contact.email,
    phone: settings.contact.phone,
    instagramUrl: instagramUrl(settings.instagram_url),
    address: settings.contact.address,
    copyright: settings.branding.copyright,
  };
}

// ------------------------------------------------------------
// Order data — read fresh, formatted for a human.
// ------------------------------------------------------------

type OrderRow = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** The customer-facing order number, derived exactly as everywhere else. */
export function orderNumberOf(id: string): string {
  return String(id).replace(/-/g, "").slice(0, 8).toUpperCase();
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/London",
});

const DATETIME_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});

/** Format a date-only value ("2026-08-12") or "" when it isn't one. */
function formatDate(value: unknown): string {
  const raw = str(value).trim();
  if (!raw) return "";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00Z` : raw);
  return Number.isNaN(d.getTime()) ? raw : DATE_FMT.format(d);
}

/** Format a timestamp, or "" when absent/unparseable. */
function formatDateTime(value: unknown): string {
  const raw = str(value).trim();
  if (!raw) return "";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : DATETIME_FMT.format(d);
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  received: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const PAYMENT_LABELS: Record<string, string> = {
  paid: "Paid",
  unpaid: "Unpaid",
  failed: "Failed",
  refunded: "Refunded",
  refund_pending: "Refund in progress",
};

function statusLabel(value: unknown): string {
  const key = str(value).toLowerCase().trim();
  return STATUS_LABELS[key] ?? (key ? key.replace(/_/g, " ") : "Pending");
}

function paymentLabel(value: unknown): string {
  const key = str(value).toLowerCase().trim();
  return PAYMENT_LABELS[key] ?? (key ? key.replace(/_/g, " ") : "Paid");
}

function paymentMethodLabel(value: unknown): string {
  const key = str(value).toLowerCase().trim();
  if (!key || key === "stripe" || key === "card") return "Card (Stripe)";
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/**
 * Strip the INTERNAL annotations lib/order-create appends to
 * special_instructions ("⚠️ ITEMS COULD NOT BE VERIFIED…", "ℹ️ RECOVERED
 * AUTOMATICALLY…"). Those are notes to the baker about our own systems; a
 * customer must never read them in a confirmation email. The customer's own
 * text is always the first block, so this only ever removes ours.
 */
function customerNotesOnly(value: unknown): string {
  return str(value)
    .split(/\n\s*\n/)
    .filter((block) => !/^\s*(⚠️|ℹ️|⚠|ℹ)/.test(block))
    .join("\n\n")
    .trim();
}

/**
 * Split the stored delivery address back into line + city.
 * lib/order-create writes it as "<line>, <city>", so the last comma-separated
 * part is the city whenever there is more than one part.
 */
function splitAddress(value: unknown): { line: string; city: string } {
  const parts = str(value)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { line: "", city: "" };
  if (parts.length === 1) return { line: parts[0], city: "" };
  return { line: parts.slice(0, -1).join(", "), city: parts[parts.length - 1] };
}

/**
 * Split "Chocolate Fudge Cake — 8 inch" back into name + size. The em dash is
 * what lib/basket-pricing joins them with, so this is exact rather than a
 * guess; a name containing no em dash simply has no size.
 */
function splitSize(name: string): { name: string; size: string } {
  const idx = name.lastIndexOf(" — ");
  if (idx === -1) return { name, size: "" };
  return { name: name.slice(0, idx).trim(), size: name.slice(idx + 3).trim() };
}

/** The accessory lines saved on an order item, if any. */
function accessoriesOf(customization: unknown): OrderEmailItem["accessories"] {
  const lines = (customization as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(lines)) return [];
  return (lines as CustomizationLine[])
    .filter((l) => l && typeof l.label === "string")
    .map((l) => ({ label: l.label, value: lineText(l), price: num(l.price) }));
}

/** Load the order's items, with product images where they exist. */
async function loadItems(
  supabase: SupabaseClient,
  orderId: string,
): Promise<OrderEmailItem[]> {
  const { data, error } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);

  if (error || !Array.isArray(data) || data.length === 0) return [];

  // Product images are a nice-to-have: a failure here costs a thumbnail,
  // never the email.
  const productIds = data
    .map((r) => str(r.product_id))
    .filter((id, i, all) => id !== "" && all.indexOf(id) === i);
  const images = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id,image_url")
      .in("id", productIds);
    for (const p of products ?? []) {
      const url = absolutise(str((p as OrderRow).image_url));
      if (url) images.set(str((p as OrderRow).id), url);
    }
  }

  return data.map((row: OrderRow) => {
    const { name, size } = splitSize(str(row.product_name));
    const quantity = Math.max(1, Math.round(num(row.quantity) || 1));
    const unitPrice = round2(num(row.unit_price));
    const addons = round2(Math.max(0, num(row.addons_total)));
    // line_total is the stored snapshot of what was charged; recompute only
    // when the column is absent on an older row.
    const stored = num(row.line_total);
    return {
      name,
      size,
      quantity,
      unitPrice,
      addons,
      lineTotal: round2(stored > 0 ? stored : (unitPrice + addons) * quantity),
      imageUrl: images.get(str(row.product_id)) ?? "",
      accessories: accessoriesOf(row.customization),
    };
  });
}

/** Everything the templates need, read from the saved order. */
async function loadOrderData(
  supabase: SupabaseClient,
  orderId: string,
): Promise<{ data: OrderEmailData; row: OrderRow } | null> {
  // select("*") keeps this resilient to schema drift — a database that
  // predates the lifecycle columns simply yields blanks for them.
  const { data: row, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !row) {
    if (error) console.error("[order-email] could not load order %s: %s", orderId, error.message);
    return null;
  }

  const order = row as OrderRow;
  const { line, city } = splitAddress(order.delivery_address);
  const total = round2(num(order.total ?? order.amount));
  const items = await loadItems(supabase, orderId);

  return {
    row: order,
    data: {
      orderNumber: orderNumberOf(orderId),
      customerName: str(order.customer_name),
      customerEmail: str(order.email),
      phone: str(order.phone),
      orderDate: formatDateTime(order.created_at),
      deliveryDate: formatDate(order.delivery_date),
      addressLine: line,
      city,
      postcode: str(order.postcode),
      items,
      specialInstructions: customerNotesOnly(order.special_instructions ?? order.message),
      subtotal: round2(num(order.subtotal)),
      deliveryFee: round2(num(order.delivery_charge)),
      discount: round2(num(order.discount_amount)),
      total,
      paymentMethod: paymentMethodLabel(order.payment_method),
      paymentStatus: paymentLabel(order.payment_status),
      orderStatus: statusLabel(order.status),
    },
  };
}

// ------------------------------------------------------------
// Transport — the existing Resend integrations, in precedence order.
// ------------------------------------------------------------

/**
 * Send one customer email.
 *
 * The admin-configured credentials come first — they are what the owner set
 * in the admin panel and what every order notification already used, so the
 * From address stays consistent with the rest of the system. When that isn't
 * configured (`skipped`), the env-var Resend client takes over, which is what
 * the auth and inquiry emails use. Both are EXISTING implementations; this
 * only decides between them.
 */
async function deliver(
  supabase: SupabaseClient,
  to: string,
  template: OrderEmailTemplate,
): Promise<{ ok: boolean; error?: string }> {
  const configured = await sendConfiguredEmail(supabase, to, template.subject, template.html);
  if (configured.status === "sent") return { ok: true };
  if (configured.status === "failed") {
    return { ok: false, error: configured.error ?? "email failed" };
  }

  // 'skipped' — no admin-configured Resend key/from address. Fall back.
  const env = await sendEmail({ to, subject: template.subject, html: template.html });
  return env.ok ? { ok: true } : { ok: false, error: env.error };
}

// ------------------------------------------------------------
// The one send path every public function goes through.
// ------------------------------------------------------------

async function sendOrderEmail(
  supabase: SupabaseClient,
  orderId: string,
  type: OrderEmailType,
  build: (brand: OrderEmailBrand, data: OrderEmailData, row: OrderRow) => OrderEmailTemplate,
  decorate?: (data: OrderEmailData, row: OrderRow) => void,
): Promise<OrderEmailOutcome> {
  const id = String(orderId ?? "").trim();
  if (!id) return { type, status: "skipped", error: "missing order id" };

  try {
    const loaded = await loadOrderData(supabase, id);
    if (!loaded) return { type, status: "skipped", error: "order not found" };

    const to = loaded.data.customerEmail.trim();
    if (!to) {
      console.error("[order-email] %s skipped — order %s has no customer email", LABELS[type], id);
      return { type, status: "skipped", error: "no recipient on order" };
    }

    // --- Duplicate protection, before anything is rendered or sent. ---
    const claim = await claimEmail(supabase, id, type, to);
    if (claim === "duplicate") {
      console.log("[order-email] %s already sent for order %s — skipping duplicate", LABELS[type], id);
      return { type, status: "duplicate" };
    }
    if (claim === "unavailable") {
      const key = guardKey(id, type);
      if (inProcessSent.has(key)) {
        console.log("[order-email] %s already sent for order %s (in-process guard)", LABELS[type], id);
        return { type, status: "duplicate" };
      }
      rememberInProcess(key);
      console.warn(
        "[order-email] order_email_log unavailable — duplicate protection is per-process only. " +
          "Run supabase/sql/45_order_email_log.sql to enable the durable guard.",
      );
    }

    decorate?.(loaded.data, loaded.row);
    const brand = await loadBrand();
    const template = build(brand, loaded.data, loaded.row);

    const result = await deliver(supabase, to, template);

    if (claim === "claimed") {
      await finaliseClaim(supabase, id, type, result.ok ? "sent" : "failed", result.error);
    } else if (!result.ok) {
      // The in-process guard must not permanently swallow a failed send.
      inProcessSent.delete(guardKey(id, type));
    }

    if (result.ok) {
      console.log("[order-email] %s Sent", LABELS[type], {
        orderId: id,
        orderNumber: loaded.data.orderNumber,
        recipient: maskEmail(to),
      });
      return { type, status: "sent" };
    }

    // FAILURE — the full address is logged here (and only here), because
    // "who didn't get their confirmation" is exactly what has to be actioned.
    console.error("[order-email] Email Failed", {
      email: LABELS[type],
      reason: result.error,
      orderId: id,
      orderNumber: loaded.data.orderNumber,
      customerEmail: to,
    });
    return { type, status: "failed", error: result.error };
  } catch (e) {
    // Nothing above is allowed to escape: every caller has already taken money
    // or changed an order, and must not fail because of an email.
    const error = e instanceof Error ? e.message : "order email failed";
    console.error("[order-email] Email Failed (unexpected)", {
      email: LABELS[type],
      reason: error,
      orderId: id,
    });
    return { type, status: "failed", error };
  }
}

// ------------------------------------------------------------
// PUBLIC API — one function per lifecycle moment.
// ------------------------------------------------------------

/**
 * ORDER CONFIRMATION. Call ONLY after Stripe reports the payment succeeded
 * AND the order row has been written — both the browser path and the Stripe
 * webhook go through lib/order-create, which is the single caller.
 */
export function sendOrderPlacedEmail(
  supabase: SupabaseClient,
  orderId: string,
): Promise<OrderEmailOutcome> {
  return sendOrderEmail(supabase, orderId, "order_placed", buildOrderPlacedEmail);
}

/**
 * ORDER ACCEPTED. Call ONLY on the real pending → received transition, after
 * the status has been persisted. The ledger makes a second call a no-op, so a
 * double-clicked Accept cannot email the customer twice.
 */
export function sendOrderAcceptedEmail(
  supabase: SupabaseClient,
  orderId: string,
): Promise<OrderEmailOutcome> {
  return sendOrderEmail(supabase, orderId, "order_accepted", buildOrderAcceptedEmail);
}

/** The customer-facing reason, in the customer's language, per cancel path. */
const CANCEL_REASONS: Record<CancelledBy, string> = {
  customer: "Cancelled at your request",
  admin: "Cancelled by our bakery",
  auto: "Not confirmed by our bakery in time",
};

/**
 * ORDER CANCELLED. Call once the cancellation has been persisted, from every
 * path that cancels: the admin panel, the customer's own cancel, and the
 * auto-cancel sweep. `refundState` reflects what Stripe did, so the email can
 * show the refund honestly without claiming money is on its way when it isn't.
 */
export function sendOrderCancelledEmail(
  supabase: SupabaseClient,
  orderId: string,
  opts: {
    by: CancelledBy;
    /** 'refunded' once Stripe confirmed it, 'refund_pending' when it failed. */
    refundState?: "refunded" | "refund_pending";
    /** Overrides the order total when a partial refund was issued. */
    refundAmount?: number;
    /** Overrides the default reason for this cancellation path. */
    reason?: string;
  },
): Promise<OrderEmailOutcome> {
  return sendOrderEmail(
    supabase,
    orderId,
    "order_cancelled",
    buildOrderCancelledEmail,
    (data) => {
      data.orderStatus = "Cancelled";
      data.cancelledAt = DATETIME_FMT.format(new Date());
      data.cancellationReason = opts.reason?.trim() || CANCEL_REASONS[opts.by];
      if (opts.refundState) {
        data.refundStatus =
          opts.refundState === "refunded" ? "Refunded" : "Refund in progress";
        data.refundAmount = round2(opts.refundAmount ?? data.total);
        data.refundEta = REFUND_ETA;
        data.paymentStatus =
          opts.refundState === "refunded" ? "Refunded" : "Refund in progress";
      }
    },
  );
}

/**
 * REFUND PROCESSED. Call ONLY after Stripe has CONFIRMED the refund — never
 * on a refund that is still pending or failed. Both refund paths (the
 * cancel-and-refund flow and the admin's retry tool) call this, and the ledger
 * guarantees the customer is told once.
 */
export function sendOrderRefundedEmail(
  supabase: SupabaseClient,
  orderId: string,
  opts: { refundAmount?: number } = {},
): Promise<OrderEmailOutcome> {
  return sendOrderEmail(
    supabase,
    orderId,
    "order_refunded",
    buildOrderRefundedEmail,
    (data) => {
      data.refundStatus = "Refunded";
      data.refundAmount = round2(opts.refundAmount ?? data.total);
      data.refundEta = REFUND_ETA;
      data.paymentStatus = "Refunded";
    },
  );
}
