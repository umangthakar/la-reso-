"use client";

// ============================================================
// Le Rasa Bakery — authentication hook (Supabase Auth)
// ------------------------------------------------------------
// Real auth backed by Supabase. Exposes the current user (derived
// from the session), sign-in triggers, and sign-out. Kept a small,
// stable surface so the navbar and account pages can consume it
// without knowing about Supabase.
//
// Two ways in, one account system: Google OAuth and email + password.
// Both end up as the same Supabase auth user, so everything downstream
// (purchase gate, profiles, orders) is unchanged.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  avatar?: string;
};

/** Result of an email/password action: a friendly message, or null on success. */
export type EmailAuthResult = {
  error: string | null;
  /** True when the address exists but hasn't clicked its verification link. */
  needsVerification?: boolean;
  /**
   * True when Supabase answered 429. The caller must NOT retry automatically —
   * every retry consumes the next slot and pushes the lockout further out.
   */
  rateLimited?: boolean;
};

/** Where the password-reset email drops the customer once the session is live. */
export const RESET_PATH = "/account/reset-password";

/**
 * Build the /auth/callback URL every email + OAuth flow returns to. `flow`
 * marks the recovery link so the callback skips the profile-completeness
 * detour and goes straight to the new-password screen.
 */
function callbackUrl(next: string, flow?: "recovery"): string {
  const params = new URLSearchParams({ next });
  if (flow) params.set("flow", flow);
  return `${window.location.origin}/auth/callback?${params.toString()}`;
}

/** The bits of Supabase's AuthError we actually branch on. */
type AuthErrorLike = { message: string; status?: number; code?: string };

/** True when Supabase is refusing an address that never confirmed its email. */
function isUnverified(message: string): boolean {
  return /not confirmed|not verified/i.test(message);
}

/**
 * True when Supabase is rate-limiting us. Keyed off the HTTP status and the
 * error code rather than the message text: 429 is the contract, the wording is
 * not. The message check is only a fallback for older gotrue builds that don't
 * populate `code`.
 */
function isRateLimited(err: AuthErrorLike): boolean {
  return (
    err.status === 429 ||
    /rate.?limit/i.test(err.code ?? "") ||
    /rate limit|after \d+ seconds/i.test(err.message)
  );
}

/**
 * Supabase's two rate limits produce very different advice, so we split them:
 *
 *  - over_email_send_rate_limit — the project's outbound email allowance. The
 *    built-in SMTP sender is only a couple of emails per hour, PROJECT-WIDE.
 *  - "you can only request this after N seconds" — the per-address throttle,
 *    one signup / verification / reset per 60s.
 *
 * Neither is retried automatically: a retry would just consume the next slot
 * and extend the lockout.
 */
function rateLimitMessage(err: AuthErrorLike): string {
  const seconds = /after (\d+) seconds?/i.exec(err.message)?.[1];
  if (seconds) {
    return `Please wait ${seconds} seconds before requesting another email.`;
  }
  if (
    err.code === "over_email_send_rate_limit" ||
    /email rate limit/i.test(err.message)
  ) {
    return "We've sent too many emails in the last hour. Please wait a few minutes and try again — your details were not lost.";
  }
  return "Too many attempts. Please wait a moment and try again.";
}

/** Turn Supabase's raw auth errors into copy a customer can act on. */
function friendlyError(err: AuthErrorLike): string {
  const { message } = err;
  if (isRateLimited(err)) {
    return rateLimitMessage(err);
  }
  if (isUnverified(message)) {
    return "Please verify your email first — check your inbox for the link.";
  }
  if (/invalid login credentials/i.test(message)) {
    return "That email and password don't match. Please try again.";
  }
  if (/already registered|already been registered/i.test(message)) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (/password.*(6|at least)/i.test(message)) {
    return "Your password must be at least 6 characters.";
  }
  if (/same.*password/i.test(message)) {
    return "That's already your password — please choose a different one.";
  }
  return message || "Something went wrong. Please try again.";
}

/**
 * Dev-only trace of every auth request that costs an email. Shows one line per
 * POST, so a duplicate request is impossible to miss in the console.
 */
function trace(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log(`[auth ${new Date().toISOString()}]`, ...args);
  }
}

/**
 * In-flight email requests, keyed by operation + address.
 *
 * `setSubmitting(true)` only disables the submit button on the NEXT render, so
 * a fast double-click (or Enter held down) can re-enter the submit handler and
 * fire a second POST to /auth/v1/signup milliseconds after the first. Supabase
 * allows one signup per address per 60 seconds, so that second POST comes back
 * 429 — which is exactly the intermittent "Too many attempts" customers hit.
 *
 * A module-level map is the synchronous guard React state can't be: the second
 * caller gets handed the first call's promise, so only ONE request ever leaves
 * the browser. It is module-level (not a ref) so it holds even if two
 * components each hold their own useAuth().
 */
const inFlight = new Map<string, Promise<EmailAuthResult>>();

function dedupe(
  key: string,
  request: () => Promise<EmailAuthResult>,
): Promise<EmailAuthResult> {
  const existing = inFlight.get(key);
  if (existing) {
    trace(`duplicate "${key}" dropped — awaiting the request already in flight`);
    return existing;
  }
  const pending = request().finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}

/**
 * Race a promise against a timeout so a hung network call (e.g. Supabase's
 * signup gateway blocking on an SMTP send that never returns) can't leave the
 * UI awaiting forever. The bound is set just beyond Supabase's own ~15s gateway
 * timeout, so a normal 504 still reaches us as an error; this only trips on a
 * genuinely dead socket. Rejects with a tagged Error the caller can catch.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Derive a friendly display user from a Supabase auth user. */
function mapUser(u: User | null): AuthUser | null {
  if (!u) return null;
  const meta = u.user_metadata ?? {};
  const name =
    (meta.full_name as string) ||
    (meta.name as string) ||
    (u.email ? u.email.split("@")[0] : "") ||
    "There";
  return {
    id: u.id,
    name,
    email: u.email ?? "",
    avatar: (meta.avatar_url as string) || (meta.picture as string) || undefined,
  };
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  // `ready` stays false until we've resolved the initial session, so the UI
  // can avoid a flash of the signed-out state on first paint.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(mapUser(data.user));
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(mapUser(session?.user ?? null));
      setReady(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /** Kick off Google OAuth. Returns to /auth/callback which decides where next. */
  const signInWithGoogle = useCallback(async (next = "/account") => {
    const supabase = createClient();
    const redirectTo = callbackUrl(next);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }, []);

  /**
   * Email + password sign-in. Supabase refuses an unverified address, which we
   * surface as `needsVerification` so the login screen can offer a resend.
   */
  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<EmailAuthResult> => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (!error) return { error: null };
      return {
        error: friendlyError(error),
        needsVerification: isUnverified(error.message),
        rateLimited: isRateLimited(error),
      };
    },
    [],
  );

  /**
   * Create an email + password account. Supabase sends the verification email;
   * the customer can only sign in once they've clicked it. `name` is stored in
   * user_metadata so the profile step (and the navbar initial) pre-fill exactly
   * as they do for Google users.
   */
  const signUpWithEmail = useCallback(
    (
      email: string,
      password: string,
      name: string,
      next = "/account",
    ): Promise<EmailAuthResult> => {
      const address = email.trim();
      // Deduped: exactly one POST /auth/v1/signup per address, however many
      // times the button is clicked before it disables.
      return dedupe(`signup:${address.toLowerCase()}`, async () => {
        const supabase = createClient();
        trace("POST /auth/v1/signup →", address);

        const startedAt = Date.now();
        try {
          // ── Before Supabase signUp ────────────────────────────────────
          // This is the ONLY external/async call in our signup path. There is
          // no Resend/SMTP/email code on our side — Supabase itself sends the
          // confirmation email synchronously inside this request, so if its
          // SMTP hangs, THIS await is where the ~15s / 504 originates.
          console.log("[signup] before supabase.auth.signUp", { email: address });

          const { data, error } = await withTimeout(
            supabase.auth.signUp({
              email: address,
              password,
              options: {
                data: { full_name: name.trim() },
                emailRedirectTo: callbackUrl(next),
              },
            }),
            20_000,
            "supabase.auth.signUp",
          );

          // ── After Supabase signUp ─────────────────────────────────────
          console.log("[signup] after supabase.auth.signUp", {
            elapsedMs: Date.now() - startedAt,
            hasError: Boolean(error),
            status: error?.status ?? null,
          });

          if (error) {
            // Structured log of the Supabase auth response (covers SMTP send
            // failures, which Supabase reports as an unexpected_failure error).
            console.error("[signup] Supabase auth error", {
              status: error.status,
              code: error.code,
              message: error.message,
            });
            trace("signup failed", { status: error.status, code: error.code, message: error.message });
            return { error: friendlyError(error), rateLimited: isRateLimited(error) };
          }

          // Note: no client-side email step to log — the verification email is
          // sent by Supabase inside the call above, not by our code.
          console.log("[signup] Supabase response", {
            userId: data.user?.id ?? null,
            hasSession: Boolean(data.session),
            needsVerification: !data.session,
          });
          trace("signup ok — verification email queued");

          // ── Before response return ────────────────────────────────────
          console.log("[signup] before returning result", {
            needsVerification: !data.session,
            elapsedMs: Date.now() - startedAt,
          });
          // A session here means email confirmation is switched off in Supabase;
          // no session means the verification email is on its way.
          return { error: null, needsVerification: !data.session };
        } catch (e) {
          // The call can REJECT (not return { error }) on a network/SMTP
          // timeout — Supabase's email send hanging ~15s is the classic case.
          // Without this catch the rejection propagates to the UI's await and
          // surfaces as an empty {} (an Error's message is non-enumerable).
          console.error("[signup] Unexpected exception during signUp", {
            elapsedMs: Date.now() - startedAt,
            error: e,
          });
          const message =
            e instanceof Error && e.message
              ? e.message
              : "We couldn't create your account right now. Please try again in a moment.";
          return { error: message };
        }
      });
    },
    [],
  );

  /** Re-send the verification email for an address that never confirmed. */
  const resendVerification = useCallback(
    (email: string, next = "/account"): Promise<EmailAuthResult> => {
      const address = email.trim();
      // Also deduped — a resend costs an email against the same rate limit.
      return dedupe(`resend:${address.toLowerCase()}`, async () => {
        const supabase = createClient();
        trace("POST /auth/v1/resend →", address);

        const { error } = await supabase.auth.resend({
          type: "signup",
          email: address,
          options: { emailRedirectTo: callbackUrl(next) },
        });

        if (error) {
          trace("resend failed", { status: error.status, code: error.code });
          return { error: friendlyError(error), rateLimited: isRateLimited(error) };
        }
        return { error: null };
      });
    },
    [],
  );

  /**
   * Send the "forgot password" email. The link lands on /auth/callback, which
   * establishes the session and forwards to /account/reset-password.
   */
  const sendPasswordReset = useCallback(
    (email: string): Promise<EmailAuthResult> => {
      const address = email.trim();
      return dedupe(`reset:${address.toLowerCase()}`, async () => {
        const supabase = createClient();
        trace("POST /auth/v1/recover →", address);

        const { error } = await supabase.auth.resetPasswordForEmail(address, {
          redirectTo: callbackUrl(RESET_PATH, "recovery"),
        });

        if (error) {
          trace("reset failed", { status: error.status, code: error.code });
          return { error: friendlyError(error), rateLimited: isRateLimited(error) };
        }
        return { error: null };
      });
    },
    [],
  );

  /** Set a new password for the currently signed-in (or recovering) user. */
  const updatePassword = useCallback(
    async (password: string): Promise<EmailAuthResult> => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      return { error: error ? friendlyError(error) : null };
    },
    [],
  );

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  // `logout` kept as an alias for existing callers.
  return {
    user,
    ready,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resendVerification,
    sendPasswordReset,
    updatePassword,
    signOut,
    logout: signOut,
  };
}
