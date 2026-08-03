// ============================================================
// Le Rasa Bakery — tiny in-process rate limiter (SERVER ONLY)
// ------------------------------------------------------------
// Used to stop brute-force guessing of the admin password. Deliberately
// dependency-free and in-memory: a fixed-window failure counter per key
// (the caller's IP), with a lockout once the threshold is crossed.
//
// SCOPE / LIMITS — be honest about what this does and doesn't do:
//   • State lives in the Node process. On a single long-lived server this
//     is a hard limit. On serverless (Vercel) each warm instance keeps its
//     own counter, so a determined attacker spread across many cold starts
//     gets more attempts than MAX_FAILURES suggests.
//   • It still removes the unbounded, single-connection brute force that
//     made a 10-character shared password trivially guessable, and it costs
//     nothing. For a hard global limit, move the counter into Postgres or
//     put a WAF/edge rate limit in front of /api/admin/login.
//
// Only FAILURES are counted, so a working admin is never throttled.
// ============================================================

import "server-only";

type Bucket = { failures: number; windowStart: number; lockedUntil: number };

const BUCKETS = new Map<string, Bucket>();

/** Failures allowed inside one window before the key is locked out. */
const MAX_FAILURES = 8;
/** Rolling window the failures are counted in. */
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
/** How long a key stays locked once it trips the threshold. */
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
/** Hard cap on tracked keys, so this can't grow without bound. */
const MAX_KEYS = 5000;

function bucketFor(key: string, now: number): Bucket {
  const existing = BUCKETS.get(key);
  if (existing) {
    // Expired window (and not locked) → start counting again.
    if (existing.lockedUntil <= now && now - existing.windowStart > WINDOW_MS) {
      existing.failures = 0;
      existing.windowStart = now;
    }
    return existing;
  }
  // Cheap eviction: if we're at the cap, drop everything already expired,
  // and if that frees nothing, clear the map rather than leak memory.
  if (BUCKETS.size >= MAX_KEYS) {
    // Array.from keeps this compatible with the project's tsconfig target
    // (no --downlevelIteration), and snapshots the keys before deleting.
    for (const [k, b] of Array.from(BUCKETS.entries())) {
      if (b.lockedUntil <= now && now - b.windowStart > WINDOW_MS) BUCKETS.delete(k);
    }
    if (BUCKETS.size >= MAX_KEYS) BUCKETS.clear();
  }
  const fresh: Bucket = { failures: 0, windowStart: now, lockedUntil: 0 };
  BUCKETS.set(key, fresh);
  return fresh;
}

export type RateLimitState = {
  /** True when the caller must be refused without even checking credentials. */
  limited: boolean;
  /** Seconds until they may try again (for the Retry-After header). */
  retryAfterSeconds: number;
};

/** Check a key BEFORE verifying credentials. Does not record anything. */
export function checkRateLimit(key: string): RateLimitState {
  const now = Date.now();
  const bucket = bucketFor(key, now);
  if (bucket.lockedUntil > now) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000)),
    };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

/** Record one failed attempt, locking the key out once it crosses the threshold. */
export function recordFailure(key: string): void {
  const now = Date.now();
  const bucket = bucketFor(key, now);
  bucket.failures += 1;
  if (bucket.failures >= MAX_FAILURES) {
    bucket.lockedUntil = now + LOCKOUT_MS;
    bucket.failures = 0;
    bucket.windowStart = now;
  }
}

/** Clear a key's failure history after a successful sign-in. */
export function recordSuccess(key: string): void {
  BUCKETS.delete(key);
}

// ------------------------------------------------------------
// Generic request-count quota (separate from the failure counter above).
//
// The login limiter deliberately counts only FAILURES, so a working admin is
// never throttled. Abuse of an endpoint that SUCCEEDS — e.g. the public inquiry
// image upload, where each success costs storage — needs the opposite: count
// every accepted request. Hence a second, independent set of buckets.
// ------------------------------------------------------------

type Quota = { used: number; windowStart: number };
const QUOTAS = new Map<string, Quota>();

export type QuotaResult = {
  /** True when the request is within quota and has been counted. */
  allowed: boolean;
  /** Seconds until the window resets (for Retry-After). */
  retryAfterSeconds: number;
  /** Requests still available in this window. */
  remaining: number;
};

/**
 * Count one request against `key`'s quota. Returns allowed:false once `max`
 * requests have been made inside `windowMs`. Same in-process caveat as above.
 */
export function consumeQuota(
  key: string,
  opts: { max: number; windowMs: number },
): QuotaResult {
  const now = Date.now();

  if (QUOTAS.size >= MAX_KEYS) {
    for (const [k, q] of Array.from(QUOTAS.entries())) {
      if (now - q.windowStart > opts.windowMs) QUOTAS.delete(k);
    }
    if (QUOTAS.size >= MAX_KEYS) QUOTAS.clear();
  }

  let bucket = QUOTAS.get(key);
  if (!bucket || now - bucket.windowStart > opts.windowMs) {
    bucket = { used: 0, windowStart: now };
    QUOTAS.set(key, bucket);
  }

  const resetIn = Math.max(1, Math.ceil((bucket.windowStart + opts.windowMs - now) / 1000));

  if (bucket.used >= opts.max) {
    return { allowed: false, retryAfterSeconds: resetIn, remaining: 0 };
  }

  bucket.used += 1;
  return { allowed: true, retryAfterSeconds: resetIn, remaining: opts.max - bucket.used };
}

/**
 * Best-effort client identity for rate limiting. Prefers the proxy headers
 * Vercel sets; falls back to a constant so a request with no usable address
 * still shares a bucket rather than escaping the limiter entirely.
 */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
