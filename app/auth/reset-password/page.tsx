"use client";

// ============================================================
// Le Rasa Bakery — set a new password from a Resend reset link
// (/auth/reset-password?token=…)
// ------------------------------------------------------------
// Token-based reset that POSTs to /api/auth/reset-password — it does NOT rely
// on a Supabase recovery session (so no Supabase SMTP anywhere in the flow).
// UI mirrors /account/reset-password: same brand card, animation and states.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function TokenResetPasswordPage() {
  // Read the token the same Suspense-safe way the signup page reads `next`.
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t && t.trim() ? t.trim() : null);
    setReady(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
      };
      if (!res.ok || !json.success) {
        setError(json.message || "We couldn't reset your password. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const cardClass = "w-full max-w-md rounded-clay bg-blush-50 p-7 shadow-clay sm:p-9";

  return (
    <section className="relative overflow-hidden pb-16 pt-28 sm:pt-36">
      <div className="pointer-events-none absolute -left-20 top-28 h-64 w-64 rounded-full bg-dustyrose/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-20 h-72 w-72 rounded-full bg-dustyrose/25 blur-3xl" />

      <div className="container relative flex justify-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className={cardClass}
        >
          {!ready ? (
            <div className="flex min-h-[10rem] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-wine" />
            </div>
          ) : !token ? (
            /* No token in the URL — the link was mistyped or already used. */
            <div className="flex flex-col items-center text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-wine text-blush-50 shadow-clay-sm">
                <KeyRound className="h-7 w-7" />
              </span>
              <h1 className="mt-4 font-display text-2xl font-semibold text-darkberry sm:text-3xl">
                This link has expired
              </h1>
              <p className="mt-2 text-sm text-darkberry-light">
                Reset links can only be used once. Request a fresh one and we&apos;ll
                email it straight over.
              </p>
              <Button asChild className="mt-6 w-full" size="lg">
                <Link href="/account/forgot-password">Send a new link</Link>
              </Button>
            </div>
          ) : done ? (
            <div className="flex flex-col items-center text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-wine text-blush-50 shadow-clay-sm">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <h1 className="mt-4 font-display text-2xl font-semibold text-darkberry sm:text-3xl">
                Password updated
              </h1>
              <p className="mt-2 text-sm text-darkberry-light">
                Your password has been reset. You can sign in with your new password now.
              </p>
              <Button asChild className="mt-6 w-full" size="lg">
                <Link href="/account/login">Continue to sign in</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-7 flex flex-col items-center text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-wine text-blush-50 shadow-clay-sm">
                  <KeyRound className="h-7 w-7" />
                </span>
                <h1 className="mt-4 font-display text-2xl font-semibold text-darkberry sm:text-3xl">
                  Set a new password
                </h1>
                <p className="mt-1 text-sm text-darkberry-light">
                  Choose a new password for your account.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">New password</Label>
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
                  <Label htmlFor="confirm">Confirm new password</Label>
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

                <Button type="submit" disabled={submitting} className="w-full" size="lg">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {submitting ? "Saving…" : "Update password"}
                </Button>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </section>
  );
}
