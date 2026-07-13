"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Cake, Loader2 } from "lucide-react";
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
  const { user, ready, signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState(false);
  // Where to send the customer once they're in — set by the purchase gate to
  // the product they were buying, otherwise the account page.
  const [next, setNext] = useState("/account");

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

  // A pending purchase means the customer was stopped mid-checkout.
  const gated = next !== "/account";

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
                ? "Sign in with Google to continue your order — we'll take you straight back."
                : "Sign in to track orders and save your details for next time."}
            </p>
          </div>

          {authError && (
            <p className="mb-4 rounded-2xl bg-wine/10 px-4 py-3 text-center text-sm font-semibold text-wine-dark">
              We couldn&apos;t sign you in. Please try again.
            </p>
          )}

          {/* Google sign-in */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={signingIn || !ready}
            className="inline-flex w-full items-center justify-center gap-3 rounded-full border-2 border-wine/20 bg-white px-6 py-3.5 text-sm font-bold text-darkberry shadow-clay-sm transition-all hover:-translate-y-0.5 hover:shadow-clay disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signingIn ? (
              <Loader2 className="h-5 w-5 animate-spin text-wine" />
            ) : (
              <GoogleMark className="h-5 w-5" />
            )}
            {signingIn ? "Redirecting to Google…" : "Continue with Google"}
          </button>

          {/* Google is the only way in — guest, email and password sign-in
              are all disabled for purchasing. */}
          <p className="mt-4 text-center text-xs font-semibold text-darkberry-light">
            Google sign-in is required to place an order.
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
