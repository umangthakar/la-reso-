"use client";

// ============================================================
// Le Rasa Bakery — forgot password (/account/forgot-password)
// Sends the Supabase reset email. The link lands on /auth/callback,
// which establishes the session and forwards to /account/reset-password.
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { KeyRound, Loader2, MailCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";

export default function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await sendPasswordReset(email);
    setSubmitting(false);

    if (res.error) {
      setError(res.error);
      return;
    }
    // Supabase deliberately succeeds even for unknown addresses, so we never
    // reveal whether an account exists.
    setSent(true);
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
            <div className="flex flex-col items-center text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-wine text-blush-50 shadow-clay-sm">
                <MailCheck className="h-7 w-7" />
              </span>
              <h1 className="mt-4 font-display text-2xl font-semibold text-darkberry sm:text-3xl">
                Check your inbox
              </h1>
              <p className="mt-2 text-sm text-darkberry-light">
                If an account exists for{" "}
                <span className="font-semibold text-wine-dark">{email}</span>,
                we&apos;ve sent a link to reset your password.
              </p>
              <Button asChild className="mt-6 w-full" size="lg">
                <Link href="/account/login">Back to sign in</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-7 flex flex-col items-center text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-wine text-blush-50 shadow-clay-sm">
                  <KeyRound className="h-7 w-7" />
                </span>
                <h1 className="mt-4 font-display text-2xl font-semibold text-darkberry sm:text-3xl">
                  Forgot your password?
                </h1>
                <p className="mt-1 text-sm text-darkberry-light">
                  Enter your email and we&apos;ll send you a link to set a new one.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
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
                  {submitting ? "Sending…" : "Send reset link"}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm font-semibold text-darkberry-light">
                Remembered it?{" "}
                <Link
                  href="/account/login"
                  className="text-wine-dark underline underline-offset-2 transition-colors hover:text-plum"
                >
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </motion.div>
      </div>
    </section>
  );
}
