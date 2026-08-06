// ============================================================
// Cron — auto-cancel Pending orders past the deadline (GET/POST)
// ------------------------------------------------------------
// The deadline is PENDING_AUTO_CANCEL_HOURS (lib/order-timeout) — the single
// source of truth, currently 2 hours for testing (normally 24).
//
// A Pending order is one the owner hasn't accepted yet. If it sits
// unaccepted that long, the customer shouldn't be left waiting: this sweep
// cancels it AND refunds the customer (shared cancelAndRefund), then
// notifies both parties — exactly like a customer cancellation.
//
// ELIGIBILITY — an order is swept only when ALL of these hold:
//   status = 'pending'         the owner never accepted it
//   payment_status = 'paid'    the customer's money is actually held, so
//                              there is something to refund
//   refund_id is null          never refunded before
//   created_at < cutoff        past the deadline (now - the window above)
// The filter lives in SQL (auto_cancel_claim_orders), so an ineligible
// order is never even loaded, let alone sent to Stripe.
//
// HOW A SWEEP IS SAFE. Three independent guards, so running this every
// hour — or twice at once — can never double-refund anyone:
//   1. TRANSACTIONAL CLAIM. auto_cancel_claim_orders selects and cancels in
//      one statement with FOR UPDATE SKIP LOCKED, so each order is handed to
//      exactly one caller and concurrent runs get disjoint batches.
//   2. STRIPE IDEMPOTENCY. The refund carries a key derived from the order
//      id, so duplicate requests collapse to one refund at Stripe's end.
//   3. THE STORED refund_id. An order that already carries one is filtered
//      out here and short-circuited again inside refundOrder.
//
// SCHEDULING — THIS ENDPOINT IS DRIVEN EXTERNALLY. There is no Vercel Cron
// entry any more (vercel.json is gone): Vercel's Hobby plan caps cron at once
// per day, and a sub-daily expression fails the DEPLOYMENT ITSELF with "cron
// expressions must be at most once per day". Any external scheduler can call
// this instead, at whatever cadence you want, on any hosting plan.
//
// The sweep is cadence-agnostic: nothing here assumes a particular gap between
// runs. It only ever touches orders that are past the deadline, and it is
// safe to run concurrently with itself (see the three guards above), so a
// scheduler that fires every minute is as correct as one that fires daily —
// just noisier. Hourly is a sensible default.
//
// SETTING IT UP (cron-job.org, and the same shape everywhere else):
//   URL      https://<your-domain>/api/cron/auto-cancel
//   Method   POST   (GET also works — some schedulers only offer GET)
//   Header   Authorization: Bearer <CRON_SECRET>
//   Schedule whatever you like, e.g. every hour at :00
// Enable "treat non-2xx as failure" so a 401 (wrong/absent secret) surfaces as
// a failed job in the scheduler's dashboard instead of passing silently.
//
// AUTH — a valid CRON_SECRET is REQUIRED. Anything else gets 401:
//   • `Authorization: Bearer <CRON_SECRET>` — the documented way, and what
//     external schedulers should send. A bare token without the "Bearer "
//     prefix is also accepted, since some schedulers send the value alone.
//   • `?secret=<CRON_SECRET>` — fallback for schedulers that cannot set
//     headers at all. Weaker: query strings land in access logs and browser
//     history, so prefer the header whenever the scheduler supports it.
//   • the admin password header — lets the owner trigger a sweep by hand from
//     an authenticated admin session.
// There is NO unauthenticated path. With CRON_SECRET unset the endpoint
// refuses every request rather than falling back to running unprotected.
// ============================================================

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import {
  cancelAndRefund,
  claimAutoCancellableOrders,
  type LifecycleOrderRow,
} from "@/lib/order-lifecycle";
import { PENDING_AUTO_CANCEL_LABEL, PENDING_AUTO_CANCEL_MS } from "@/lib/order-timeout";

export const dynamic = "force-dynamic";
// node:crypto + the ws-based Supabase admin client both need the Node runtime.
export const runtime = "nodejs";
// Hosting cap for a single invocation (60s is also the Vercel Hobby ceiling).
// The sweep respects its own, smaller budget below and finishes the rest on the
// next run rather than being killed mid-refund. Set your scheduler's request
// timeout at or above this so it doesn't record a false failure on a long run.
export const maxDuration = 60;

/** Orders claimed per transaction. Small enough that a killed invocation
 *  strands at most this many mid-flight, large enough for a normal backlog. */
const BATCH_SIZE = 25;
/** Stop claiming new batches after this long, leaving headroom under
 *  maxDuration to finish the batch in hand and answer. Anything left over is
 *  reported as `truncated` and picked up by the next scheduled run. */
const TIME_BUDGET_MS = 45_000;

/** `via` records which credential was accepted — logged on every run so a
 *  scheduler misconfiguration is visible without guessing. */
type Auth =
  | { ok: false; reason: string; diagnostics: Record<string, boolean> }
  | { ok: true; via: "bearer" | "query" | "admin" };

/**
 * Pull the presented secret out of a request, in both accepted forms.
 *
 * Everything is trimmed. Values pasted into a dashboard env field routinely
 * carry a trailing newline or space, and a strict comparison against an
 * untrimmed `process.env` value then fails for BOTH the header and the query
 * param — which looks exactly like "the secret is wrong" while it is
 * byte-for-byte right apart from the whitespace.
 */
function presentedSecrets(req: Request): { fromHeader: string | null; fromQuery: string[] } {
  const rawAuth = req.headers.get("authorization");
  // Scheme is matched case-insensitively; a bare token (no "Bearer") is also
  // accepted, since some schedulers send the value on its own.
  const fromHeader = rawAuth ? (/^\s*bearer\s+(.*)$/i.exec(rawAuth)?.[1] ?? rawAuth).trim() : null;

  const url = new URL(req.url);
  const fromQuery: string[] = [];
  const decoded = url.searchParams.get("secret");
  if (decoded !== null) fromQuery.push(decoded.trim());
  // The literal, undecoded value too: URLSearchParams turns "+" into a space,
  // so a generated secret containing "+" would never match its decoded form.
  const literal = /[?&]secret=([^&]*)/.exec(url.search)?.[1];
  if (literal !== undefined) fromQuery.push(literal.trim());

  return { fromHeader, fromQuery };
}

/**
 * Constant-time secret comparison. A plain `===` on strings bails at the first
 * differing byte, which leaks how much of a guess was right to anyone able to
 * time the endpoint; timingSafeEqual always compares the whole buffer.
 * (Length has to be compared first, and the length is not the secret.)
 */
function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function authorise(req: Request): Auth {
  if (isAuthedRequest(req)) return { ok: true, via: "admin" }; // admin, by hand

  const rawSecret = process.env.CRON_SECRET;
  const secret = (rawSecret ?? "").trim();
  const { fromHeader, fromQuery } = presentedSecrets(req);

  // No secret configured = no way in. Previously an unauthenticated Vercel Cron
  // invocation was accepted here as a no-config fallback; with Vercel Cron gone
  // that path would be a public endpoint that cancels and refunds orders, so it
  // is deliberately absent. Misconfiguration must fail closed.
  if (secret) {
    if (fromHeader && secretMatches(fromHeader, secret)) return { ok: true, via: "bearer" };
    if (fromQuery.some((v) => secretMatches(v, secret))) return { ok: true, via: "query" };
  }

  // ---- Rejected. Report precisely WHICH check failed. -------------------
  // Values are never logged — only presence, lengths and comparison outcomes,
  // which is enough to tell "env var missing" from "value differs" from
  // "whitespace" without putting the secret in a log line.
  const candidates = [fromHeader, ...fromQuery].filter((v): v is string => !!v);
  const reason = !secret
    ? "CRON_SECRET is not configured in this runtime, so the endpoint refuses " +
      "every request. Set it for the Production environment and redeploy — a " +
      "local .env file is never deployed."
    : candidates.length === 0
      ? "CRON_SECRET is defined, but the request presented no secret (no " +
        "Authorization header and no ?secret= parameter reached the route)."
      : "CRON_SECRET is defined and a secret was presented, but they differ.";

  console.error("[cron/auto-cancel] 401 — %s", reason, {
    cronSecretDefined: rawSecret !== undefined,
    cronSecretLength: secret.length,
    // True when the env value had surrounding whitespace — a very common cause
    // of a "matching" secret failing a strict comparison.
    cronSecretHadSurroundingWhitespace: rawSecret !== undefined && rawSecret !== rawSecret.trim(),
    authorizationHeaderReceived: req.headers.has("authorization"),
    authorizationTokenLength: fromHeader?.length ?? 0,
    secretQueryParamReceived: fromQuery.length > 0,
    secretQueryParamLength: fromQuery[0]?.length ?? 0,
    anyCandidateLengthMatches: candidates.some((v) => v.length === secret.length),
  });

  return {
    ok: false,
    reason,
    // Booleans only — no values, no lengths — so a curl against the live
    // endpoint is self-diagnosing without leaking anything about the secret.
    diagnostics: {
      cronSecretDefined: rawSecret !== undefined,
      authorizationHeaderReceived: req.headers.has("authorization"),
      secretQueryParamReceived: fromQuery.length > 0,
      presentedSecretLengthMatches: candidates.some((v) => v.length === secret.length),
    },
  };
}

type SweptOrder = {
  id: string;
  payment_status: "refunded" | "refund_pending";
  refund_id?: string;
  refund_error?: string;
};

/**
 * Fallback path for a database where 39_auto_cancel_sweep.sql hasn't been run:
 * read the eligible orders, then let cancelAndRefund claim each one with its
 * conditional `WHERE status = 'pending'` update. Same guarantees, one order at
 * a time and two round-trips instead of one.
 */
async function sweepWithoutRpc(
  supabase: SupabaseClient,
  cutoff: string,
): Promise<{ results: SweptOrder[]; skipped: number; error?: string }> {
  // Full eligibility filter first; a pre-27 database has neither
  // payment_status nor refund_id, so retry on the columns that always exist.
  let { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("status", "pending")
    .eq("payment_status", "paid")
    .is("refund_id", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE * 4);

  if (error) {
    ({ data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("status", "pending")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE * 4));
  }
  if (error) return { results: [], skipped: 0, error: error.message };

  const results: SweptOrder[] = [];
  // Orders that left 'pending' between the SELECT above and the claim below —
  // accepted by the admin, cancelled by the customer, or taken by an
  // overlapping run of this same sweep. Skipped, never refunded.
  let skipped = 0;

  for (const order of (data ?? []) as LifecycleOrderRow[]) {
    // onlyIfStatus makes the pending → cancelled transition the atomic claim:
    // the refund only happens for the caller that actually won it.
    const res = await cancelAndRefund(supabase, order, "auto", { onlyIfStatus: "pending" });
    if (!res) {
      skipped += 1;
      continue;
    }
    results.push({
      id: String(order.id),
      payment_status: res.paymentStatus,
      refund_id: res.refundId,
      refund_error: res.refundError,
    });
  }

  return { results, skipped };
}

async function runSweep(req: Request) {
  const auth = authorise(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "Not authorised", reason: auth.reason, diagnostics: auth.diagnostics },
      { status: 401 },
    );
  }

  const startedAt = Date.now();
  // EXECUTION START. Every run leaves a trace even when it sweeps nothing, so
  // "the scheduler never fired" is distinguishable from "it fired and found no
  // eligible orders" — the two look identical from the database alone.
  console.log("[cron/auto-cancel] START", {
    at: new Date(startedAt).toISOString(),
    via: auth.via,
    method: req.method,
  });

  const supabase = createAdminClient() as unknown as SupabaseClient;
  // Cutoff in UTC. Date.now() is epoch-based (no local-time component) and
  // toISOString() emits a Z-suffixed instant, which Postgres compares against
  // created_at (timestamptz) in UTC — so the window is the same regardless
  // of the server's, the database's or the customer's timezone.
  const cutoff = new Date(startedAt - PENDING_AUTO_CANCEL_MS).toISOString();

  const results: SweptOrder[] = [];
  let skipped = 0;
  let batches = 0;
  // True when the time budget ran out with orders still eligible — the next
  // scheduled run continues from there. Worth surfacing: a sweep that is
  // permanently truncated means the backlog is growing faster than it drains.
  let truncated = false;
  let mode: "transactional" | "fallback" = "transactional";

  for (;;) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      truncated = true;
      break;
    }

    const claimed = await claimAutoCancellableOrders(supabase, cutoff, BATCH_SIZE);

    // null = the claim function isn't installed. Do the whole sweep the old way.
    if (claimed === null) {
      mode = "fallback";
      console.warn(
        "[cron/auto-cancel] auto_cancel_claim_orders unavailable — falling back to " +
          "per-order claims. Run supabase/sql/39_auto_cancel_sweep.sql to enable the " +
          "transactional path.",
      );
      const legacy = await sweepWithoutRpc(supabase, cutoff);
      if (legacy.error) {
        // FAILURE — the read itself failed, so nothing was swept.
        console.error("[cron/auto-cancel] FAILED to load eligible orders:", legacy.error);
        return NextResponse.json({ error: legacy.error }, { status: 500 });
      }
      console.log("[cron/auto-cancel] ELIGIBLE (fallback path)", {
        found: legacy.results.length + legacy.skipped,
        claimed: legacy.results.length,
        skipped: legacy.skipped,
      });
      results.push(...legacy.results);
      skipped += legacy.skipped;
      break;
    }

    if (claimed.length === 0) break;
    batches += 1;

    // ELIGIBLE ORDERS FOUND — logged per batch, since a large backlog drains
    // over several batches within one run.
    console.log("[cron/auto-cancel] ELIGIBLE", {
      batch: batches,
      claimed: claimed.length,
      cutoff,
    });

    // These rows are ours: the claim already flipped them to 'cancelled' inside
    // its transaction, so alreadyClaimed skips a second (now impossible) claim
    // and goes straight to the refund + notifications.
    for (const order of claimed) {
      const res = await cancelAndRefund(supabase, order, "auto", { alreadyClaimed: true });
      const orderId = String(order.id);
      if (res.paymentStatus === "refunded") {
        // REFUND PROCESSED.
        console.log(`[cron/auto-cancel] REFUNDED order ${orderId} (refund ${res.refundId})`);
      } else {
        // FAILURE — order is cancelled but the money is still held.
        console.error(
          `[cron/auto-cancel] REFUND FAILED for order ${orderId}: ${res.refundError ?? "unknown error"}`,
        );
      }
      results.push({
        id: orderId,
        payment_status: res.paymentStatus,
        refund_id: res.refundId,
        refund_error: res.refundError,
      });
    }

    // A short batch means the queue is drained.
    if (claimed.length < BATCH_SIZE) break;
  }

  const refunded = results.filter((r) => r.payment_status === "refunded").length;
  const refundPending = results.length - refunded;

  if (refundPending > 0) {
    // These orders are cancelled but the money is still with us — the owner has
    // to refund them by hand. Logged loudly because it needs a human.
    console.error(
      "[cron/auto-cancel] %d order(s) cancelled but NOT refunded — manual refund needed.",
      refundPending,
    );
  }

  const summary = {
    swept: results.length,
    refunded,
    refundPending,
    skipped,
    batches,
    truncated,
    mode,
    // The window this run applied, alongside the instant it resolved to —
    // so a log line proves which deadline was in force.
    window: PENDING_AUTO_CANCEL_LABEL,
    cutoff,
    durationMs: Date.now() - startedAt,
  };
  // EXECUTION COMPLETED. `ok: true` and this line are what a scheduler's
  // dashboard and the platform logs are checked against after a failed night.
  console.log("[cron/auto-cancel] COMPLETE", summary);

  // Every authorised caller has proved it knows a secret (there is no
  // unauthenticated path any more), so the per-order detail is always included.
  return NextResponse.json({ ok: true, ...summary, results });
}

export async function GET(req: Request) {
  return runSweep(req);
}

export async function POST(req: Request) {
  return runSweep(req);
}
