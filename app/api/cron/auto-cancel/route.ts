// ============================================================
// Cron — auto-cancel Pending orders older than 24 hours (GET/POST)
// ------------------------------------------------------------
// A Pending order is one the owner hasn't accepted yet. If it sits
// unaccepted for 24h, the customer shouldn't be left waiting: this sweep
// cancels it AND refunds the customer (shared cancelAndRefund), then
// notifies both parties — exactly like a customer cancellation.
//
// Runs on a schedule (Vercel Cron — see vercel.json) and is safe to run as
// often as you like: it only ever touches orders that are BOTH
// status='pending' AND older than 24h, and cancelAndRefund is idempotent
// per order (a refunded order won't be double-refunded).
//
// SCHEDULE: vercel.json runs this once a day, because Vercel's Hobby plan
// limits cron jobs to a once-per-day cadence (a sub-daily schedule makes the
// deployment fail). For tighter timing you can EITHER upgrade to Vercel Pro
// and set a more frequent schedule, OR point any external scheduler
// (cron-job.org, GitHub Actions, UptimeRobot, …) at this endpoint with the
// ?secret=<CRON_SECRET> query param — the sweep itself supports any cadence.
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

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { cancelAndRefund } from "@/lib/order-lifecycle";

export const dynamic = "force-dynamic";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/** "trusted" = proved it knows a secret, so it may see order ids. */
type Auth =
  | { ok: false; reason: string; diagnostics: Record<string, boolean> }
  | { ok: true; trusted: boolean };

/**
 * Pull the presented secret out of a request, in both accepted forms.
 *
 * Everything is trimmed. Values pasted into a dashboard env field routinely
 * carry a trailing newline or space, and a strict `===` against an untrimmed
 * `process.env` value then fails for BOTH the header and the query param —
 * which looks exactly like "the secret is wrong" while it is byte-for-byte
 * right apart from the whitespace.
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

function authorise(req: Request): Auth {
  if (isAuthedRequest(req)) return { ok: true, trusted: true }; // admin, by hand

  const rawSecret = process.env.CRON_SECRET;
  const secret = (rawSecret ?? "").trim();
  const { fromHeader, fromQuery } = presentedSecrets(req);
  const isVercelCron = req.headers.has("x-vercel-cron-schedule");

  if (secret) {
    if (fromHeader && fromHeader === secret) return { ok: true, trusted: true };
    if (fromQuery.some((v) => v && v === secret)) return { ok: true, trusted: true };
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

async function runSweep(req: Request) {
  const auth = authorise(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "Not authorised", reason: auth.reason, diagnostics: auth.diagnostics },
      { status: 401 },
    );
  }

  const supabase = createAdminClient() as unknown as SupabaseClient;
  // Cutoff in UTC. Date.now() is epoch-based (no local-time component) and
  // toISOString() emits a Z-suffixed instant, which Postgres compares against
  // created_at (timestamptz) in UTC — so the 24h window is the same regardless
  // of the server's, the database's or the customer's timezone.
  const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString();

  // Only pending orders older than the cutoff. select("*") so cancelAndRefund
  // has the fields it needs (email, name, payment intent, total).
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("status", "pending")
    .lt("created_at", cutoff);

  if (error) {
    // A pre-27 database has no 'pending' orders at all — nothing to do.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = data ?? [];
  const results: { id: string; payment_status: string }[] = [];
  // Orders that left 'pending' between the SELECT above and the claim below —
  // accepted by the admin, cancelled by the customer, or taken by an
  // overlapping run of this same sweep. Skipped, never refunded.
  let skipped = 0;

  for (const order of orders) {
    // onlyIfStatus makes the pending → cancelled transition the atomic claim:
    // the refund only happens for the caller that actually won it.
    const res = await cancelAndRefund(supabase, order, "auto", { onlyIfStatus: "pending" });
    if (!res) {
      skipped += 1;
      continue;
    }
    results.push({ id: String(order.id), payment_status: res.paymentStatus });
  }

  // Order ids only for a caller that proved it knows a secret.
  return NextResponse.json(
    auth.trusted
      ? { swept: results.length, skipped, cutoff, results }
      : { swept: results.length, skipped, cutoff },
  );
}

export async function GET(req: Request) {
  return runSweep(req);
}

export async function POST(req: Request) {
  return runSweep(req);
}
