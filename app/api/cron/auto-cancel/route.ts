// ============================================================
// Cron — auto-cancel Pending orders older than 24 hours (GET/POST)
// ------------------------------------------------------------
// A Pending order is one the owner hasn't accepted yet. If it sits
// unaccepted for 24h, the customer shouldn't be left waiting: this sweep
// cancels it AND refunds the customer (shared cancelAndRefund), then
// notifies both parties — exactly like a customer cancellation.
//
// ELIGIBILITY — an order is swept only when ALL of these hold:
//   status = 'pending'         the owner never accepted it
//   payment_status = 'paid'    the customer's money is actually held, so
//                              there is something to refund
//   refund_id is null          never refunded before
//   created_at < now() - 24h   past the deadline
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
// SCHEDULE: hourly (vercel.json, `0 * * * *`). A sub-daily cron requires
// Vercel PRO — on the Hobby plan the deployment is rejected with "cron
// expressions must be at most once per day", so either upgrade, drop the
// schedule back to `0 3 * * *`, or point an external scheduler
// (cron-job.org, GitHub Actions, UptimeRobot, …) at this endpoint with
// ?secret=<CRON_SECRET>. The sweep itself supports any cadence.
//
// AUTH — accepts any of:
//   • Vercel Cron's `Authorization: Bearer <CRON_SECRET>` (set CRON_SECRET
//     in the project env; Vercel sends it automatically), OR
//   • `?secret=<CRON_SECRET>` for manual/external triggering, OR
//   • the admin password header (lets the owner run it by hand), OR
//   • a Vercel Cron invocation identified by `x-vercel-cron-schedule` — the
//     no-config fallback described below.
//
// !! THIS WAS THE BUG. Vercel only attaches the `Authorization: Bearer …`
// header when CRON_SECRET is defined in the project env. With it undefined the
// nightly invocation arrived with NO credentials at all, `isAuthorised()`
// returned false on the `if (!secret) return false` line, and every single run
// answered 401 without ever reaching the sweep — so Pending orders were never
// cancelled. Nothing logged it, so the failure was invisible.
//
// The fix has two halves:
//   1. CRON_SECRET is now documented in .env.example / .env.local.example, and
//      a missing one is logged loudly on every rejected call instead of failing
//      silently. Setting it is still the recommended, strongest setup.
//   2. So the feature is not dead when it is unset, a request carrying Vercel's
//      `x-vercel-cron-schedule` header (present on genuine cron invocations) is
//      accepted, but answers with counts only — no order ids — so an untrusted
//      caller learns nothing. The worst it can do is cancel orders that are
//      already past the 24h deadline, which is precisely what is meant to
//      happen to them.
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

export const dynamic = "force-dynamic";
// node:crypto + the ws-based Supabase admin client both need the Node runtime.
export const runtime = "nodejs";
// Vercel's cap for a scheduled function. The sweep respects its own, smaller
// budget below and finishes the rest on the next run rather than being killed
// mid-refund.
export const maxDuration = 60;

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
/** Orders claimed per transaction. Small enough that a killed invocation
 *  strands at most this many mid-flight, large enough for a normal backlog. */
const BATCH_SIZE = 25;
/** Stop claiming new batches after this long, leaving headroom under
 *  maxDuration to finish the batch in hand and answer. Hourly runs mean
 *  whatever is left is picked up 60 minutes later. */
const TIME_BUDGET_MS = 45_000;

/** "trusted" = proved it knows a secret, so it may see order ids. */
type Auth =
  | { ok: false; reason: string; diagnostics: Record<string, boolean> }
  | { ok: true; trusted: boolean };

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
  if (isAuthedRequest(req)) return { ok: true, trusted: true }; // admin, by hand

  const rawSecret = process.env.CRON_SECRET;
  const secret = (rawSecret ?? "").trim();
  const { fromHeader, fromQuery } = presentedSecrets(req);
  const isVercelCron = req.headers.has("x-vercel-cron-schedule");

  if (secret) {
    if (fromHeader && secretMatches(fromHeader, secret)) return { ok: true, trusted: true };
    if (fromQuery.some((v) => secretMatches(v, secret))) return { ok: true, trusted: true };
  }

  // Fallback: a genuine Vercel Cron invocation. Only reachable when the secret
  // is unset — with a secret configured we insist on it.
  if (!secret && isVercelCron) {
    console.warn(
      "[cron/auto-cancel] Running WITHOUT CRON_SECRET — accepted on the Vercel " +
        "cron header. Set CRON_SECRET in the project env to authenticate properly.",
    );
    return { ok: true, trusted: false };
  }

  // ---- Rejected. Report precisely WHICH check failed. -------------------
  // Values are never logged — only presence, lengths and comparison outcomes,
  // which is enough to tell "env var missing" from "value differs" from
  // "whitespace" without putting the secret in a log line.
  const candidates = [fromHeader, ...fromQuery].filter((v): v is string => !!v);
  const reason = !rawSecret
    ? "CRON_SECRET is not defined in this runtime. Check it is set for the " +
      "Production environment and that the deployment was created AFTER you added it."
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
    isVercelCronInvocation: isVercelCron,
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
  const supabase = createAdminClient() as unknown as SupabaseClient;
  // Cutoff in UTC. Date.now() is epoch-based (no local-time component) and
  // toISOString() emits a Z-suffixed instant, which Postgres compares against
  // created_at (timestamptz) in UTC — so the 24h window is the same regardless
  // of the server's, the database's or the customer's timezone.
  const cutoff = new Date(startedAt - TWENTY_FOUR_HOURS_MS).toISOString();

  const results: SweptOrder[] = [];
  let skipped = 0;
  let batches = 0;
  // True when the time budget ran out with orders still eligible — the next
  // hourly run continues from there. Worth surfacing: a sweep that is
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
      const legacy = await sweepWithoutRpc(supabase, cutoff);
      if (legacy.error) {
        return NextResponse.json({ error: legacy.error }, { status: 500 });
      }
      results.push(...legacy.results);
      skipped += legacy.skipped;
      break;
    }

    if (claimed.length === 0) break;
    batches += 1;

    // These rows are ours: the claim already flipped them to 'cancelled' inside
    // its transaction, so alreadyClaimed skips a second (now impossible) claim
    // and goes straight to the refund + notifications.
    for (const order of claimed) {
      const res = await cancelAndRefund(supabase, order, "auto", { alreadyClaimed: true });
      results.push({
        id: String(order.id),
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
    cutoff,
    durationMs: Date.now() - startedAt,
  };
  console.log("[cron/auto-cancel] sweep complete", summary);

  // Order ids only for a caller that proved it knows a secret.
  return NextResponse.json(auth.trusted ? { ...summary, results } : summary);
}

export async function GET(req: Request) {
  return runSweep(req);
}

export async function POST(req: Request) {
  return runSweep(req);
}
