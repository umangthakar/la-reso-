"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Cake, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";

/** Inline Google "G" mark (no external asset — CSP-safe). */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

/** Only same-origin paths are honoured as a post-login destination. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/account";
  return raw;
}

export default function LoginPage() {
  const router = useRouter();
  const { user, ready, signInWithGoogle, signInWithEmail, resendVerification } =
    useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState(false);
  // Where to send the customer once they're in — set by the purchase gate to
  // the product they were buying, otherwise the account page.
  const [next, setNext] = useState("/account");

  // Email + password state.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when Supabase refuses an address that never clicked its verify link.
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);

  // Read ?error= / ?next= from the URL without useSearchParams (avoids the
  // Suspense-boundary requirement during static generation).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAuthError(params.has("error"));
    setNext(safeNext(params.get("next")));
  }, []);

  // Already signed in? Skip the login screen.
  useEffect(() => {
    if (ready && user) router.replace(next);
  }, [ready, user, next, router]);

  async function handleGoogle() {
    setSigningIn(true);
    try {
      await signInWithGoogle(next);
      // A full-page redirect to Google follows; keep the spinner meanwhile.
    } catch {
      setSigningIn(false);
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setUnverified(false);
    setResent(false);

    const res = await signInWithEmail(email, password);
    if (res.error) {
      setError(res.error);
      setUnverified(!!res.needsVerification);
      setSubmitting(false);
      return;
    }
    // The session is live: onAuthStateChange updates `user`, but push straight
    // away so there's no pause on a slow connection.
    router.replace(next);
  }

  async function handleResend() {
    setSubmitting(true);
    const res = await resendVerification(email, next);
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setError(null);
    setUnverified(false);
    setResent(true);
  }

  // A pending purchase means the customer was stopped mid-checkout.
  const gated = next !== "/account";
  const busy = submitting || signingIn;

  return (
    <section className="relative overflow-hidden pb-16 pt-28 sm:pt-36">
      <div className="pointer-events-none absolute -left-20 top-28 h-64 w-64 rounded-full bg-dustyrose/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-20 h-72 w-72 rounded-full bg-dustyrose/25 blur-3xl" />

      <div className="container relative flex justify-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md rounded-clay bg-blush-50 p-7 shadow-clay sm:p-9"
        >
          {/* Brand mark */}
          <div className="mb-7 flex flex-col items-center text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-wine text-blush-50 shadow-clay-sm">
              <Cake className="h-7 w-7" />
            </span>
            <h1 className="mt-4 font-display text-2xl font-semibold text-darkberry sm:text-3xl">
              Welcome to Le Rasa
            </h1>
            <p className="mt-1 text-sm text-darkberry-light">
              {gated
                ? "Sign in to continue your order — we'll take you straight back."
                : "Sign in to track orders and save your details for next time."}
            </p>
          </div>

          {authError && (
            <p className="mb-4 rounded-2xl bg-wine/10 px-4 py-3 text-center text-sm font-semibold text-wine-dark">
              We couldn&apos;t sign you in. Please try again.
            </p>
          )}

          {/* Email + password sign-in */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/account/forgot-password"
                  className="text-xs font-semibold text-wine-dark transition-colors hover:text-plum"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className="rounded-2xl bg-wine/10 px-4 py-3 text-sm font-semibold text-wine-dark">
                <p>{error}</p>
                {unverified && (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={busy}
                    className="mt-1 underline underline-offset-2 hover:text-plum disabled:opacity-60"
                  >
                    Resend the verification email
                  </button>
                )}
              </div>
            )}

            {resent && (
              <p className="rounded-2xl bg-dustyrose-light/60 px-4 py-3 text-sm font-semibold text-wine-dark">
                Verification email sent — check your inbox.
              </p>
            )}

            <Button type="submit" disabled={busy} className="w-full" size="lg">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? "Signing in…" : "Login"}
            </Button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-wine/15" />
            <span className="text-xs font-bold uppercase tracking-widest text-darkberry-light">
              or
            </span>
            <span className="h-px flex-1 bg-wine/15" />
          </div>

          {/* Google sign-in */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy || !ready}
            className="inline-flex w-full items-center justify-center gap-3 rounded-full border-2 border-wine/20 bg-white px-6 py-3.5 text-sm font-bold text-darkberry shadow-clay-sm transition-all hover:-translate-y-0.5 hover:shadow-clay disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signingIn ? (
              <Loader2 className="h-5 w-5 animate-spin text-wine" />
            ) : (
              <GoogleMark className="h-5 w-5" />
            )}
            {signingIn ? "Redirecting to Google…" : "Continue with Google"}
          </button>

          <p className="mt-6 text-center text-sm font-semibold text-darkberry-light">
            New to Le Rasa?{" "}
            <Link
              href={
                gated
                  ? `/account/signup?next=${encodeURIComponent(next)}`
                  : "/account/signup"
              }
              className="text-wine-dark underline underline-offset-2 transition-colors hover:text-plum"
            >
              Create Account
            </Link>
          </p>

          <p className="mt-5 text-center text-xs text-darkberry-light">
            By continuing you agree to our friendly terms — we only use your
            details to bake and deliver your order.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
