"use client";

// ============================================================
// Le Rasa Bakery — create account (/account/signup)
// Email + password registration. Supabase sends the verification email;
// the customer can only sign in once they've clicked the link. Google
// remains available as the one-tap alternative.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Cake, Loader2, MailCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";

/** Only same-origin paths are honoured as a post-signup destination. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/account";
  return raw;
}

export default function SignupPage() {
  const router = useRouter();
  const { user, ready, signUpWithEmail } = useAuth();

  const [next, setNext] = useState("/account");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Switches the card to the "check your inbox" state.
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setNext(safeNext(new URLSearchParams(window.location.search).get("next")));
  }, []);

  // Already signed in? Nothing to create.
  useEffect(() => {
    if (ready && user && !sent) router.replace(next);
  }, [ready, user, sent, next, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please tell us your name.");
      return;
    }
    if (password.length < 6) {
      setError("Your password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await signUpWithEmail(email, password, name, next);

      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.needsVerification) {
        setSent(true);
        return;
      }
      // Email confirmation switched off in Supabase — the session is already live.
      router.replace(next);
    } catch (err) {
      // Last-resort guard: signUpWithEmail already catches, but never let an
      // unexpected rejection surface to the customer as an empty {} object.
      console.error("[signup:ui] Unexpected error creating account", err);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong creating your account. Please try again.",
      );
    } finally {
      // Always clears the loading state — even on an exception the button
      // returns from "Creating account…" instead of hanging.
      setSubmitting(false);
    }
  }

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
          {sent ? (
            /* ── Verification sent ───────────────────────────── */
            <div className="flex flex-col items-center text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-wine text-blush-50 shadow-clay-sm">
                <MailCheck className="h-7 w-7" />
              </span>
              <h1 className="mt-4 font-display text-2xl font-semibold text-darkberry sm:text-3xl">
                Check your inbox
              </h1>
              <p className="mt-2 text-sm text-darkberry-light">
                We&apos;ve sent a verification link to{" "}
                <span className="font-semibold text-wine-dark">{email}</span>.
                Click it to activate your account, then sign in.
              </p>
              <Button asChild className="mt-6 w-full" size="lg">
                <Link href="/account/login">Back to sign in</Link>
              </Button>
              <p className="mt-4 text-xs text-darkberry-light">
                Can&apos;t find it? Check your spam folder — it can take a minute
                to arrive.
              </p>
            </div>
          ) : (
            /* ── Registration form ───────────────────────────── */
            <>
              <div className="mb-7 flex flex-col items-center text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-wine text-blush-50 shadow-clay-sm">
                  <Cake className="h-7 w-7" />
                </span>
                <h1 className="mt-4 font-display text-2xl font-semibold text-darkberry sm:text-3xl">
                  Create your account
                </h1>
                <p className="mt-1 text-sm text-darkberry-light">
                  Save your details, track orders and reorder in one tap.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Smith"
                    autoComplete="name"
                    required
                  />
                </div>

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
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    required
                  />
                </div>

                {error && (
                  <p className="rounded-2xl bg-wine/10 px-4 py-3 text-sm font-semibold text-wine-dark">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full"
                  size="lg"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {submitting ? "Creating account…" : "Create Account"}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm font-semibold text-darkberry-light">
                Already have an account?{" "}
                <Link
                  href={
                    next === "/account"
                      ? "/account/login"
                      : `/account/login?next=${encodeURIComponent(next)}`
                  }
                  className="text-wine-dark underline underline-offset-2 transition-colors hover:text-plum"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}
        </motion.div>
      </div>
    </section>
  );
}
