"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Cake, Mail, Lock, User, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/use-auth";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [mode, setMode] = useState<Mode>("login");

  // Login fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Signup fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  function handleLogin(e: FormEvent) {
    e.preventDefault();
    // Demo: accept anything, mint a fake user with a friendly default name.
    login({ name: "Jane Smith", email: email.trim() });
    router.push("/account");
  }

  function handleSignup(e: FormEvent) {
    e.preventDefault();
    if (signupPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setError("");
    const name = `${firstName.trim()} ${lastName.trim()}`.trim() || "Jane Smith";
    login({ name, email: signupEmail.trim() });
    router.push("/account");
  }

  function continueAsGuest() {
    router.push("/menu");
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
          {/* Brand mark */}
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-wine text-blush-50 shadow-clay-sm">
              <Cake className="h-7 w-7" />
            </span>
            <h1 className="mt-4 font-display text-2xl font-semibold text-darkberry sm:text-3xl">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-1 text-sm text-darkberry-light">
              {mode === "login"
                ? "Sign in to track orders and save your favourites."
                : "Join Le Rasa for a sweeter shopping experience."}
            </p>
          </div>

          <AnimatePresence mode="wait">
            {mode === "login" ? (
              <motion.form
                key="login"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25 }}
                onSubmit={handleLogin}
                className="space-y-4"
              >
                <Field
                  id="email"
                  label="Email"
                  type="email"
                  icon={Mail}
                  value={email}
                  onChange={setEmail}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
                <Field
                  id="password"
                  label="Password"
                  type="password"
                  icon={Lock}
                  value={password}
                  onChange={setPassword}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <Button type="submit" className="w-full" size="lg">
                  Sign In
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.form>
            ) : (
              <motion.form
                key="signup"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.25 }}
                onSubmit={handleSignup}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    id="firstName"
                    label="First name"
                    icon={User}
                    value={firstName}
                    onChange={setFirstName}
                    placeholder="Jane"
                    autoComplete="given-name"
                    required
                  />
                  <Field
                    id="lastName"
                    label="Last name"
                    icon={User}
                    value={lastName}
                    onChange={setLastName}
                    placeholder="Smith"
                    autoComplete="family-name"
                    required
                  />
                </div>
                <Field
                  id="signupEmail"
                  label="Email"
                  type="email"
                  icon={Mail}
                  value={signupEmail}
                  onChange={setSignupEmail}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
                <Field
                  id="signupPassword"
                  label="Password"
                  type="password"
                  icon={Lock}
                  value={signupPassword}
                  onChange={setSignupPassword}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
                <Field
                  id="confirmPassword"
                  label="Confirm password"
                  type="password"
                  icon={Lock}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
                {error && (
                  <p className="text-sm font-semibold text-wine">{error}</p>
                )}
                <Button type="submit" className="w-full" size="lg">
                  Create Account
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Switch mode */}
          <button
            type="button"
            onClick={() => {
              setError("");
              setMode((m) => (m === "login" ? "signup" : "login"));
            }}
            className="mt-5 w-full text-center text-sm font-semibold text-wine-dark transition-colors hover:text-plum"
          >
            {mode === "login"
              ? "New here? Create account"
              : "Already have an account? Sign in"}
          </button>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-darkberry-light/60">
            <span className="h-px flex-1 bg-wine/15" />
            or
            <span className="h-px flex-1 bg-wine/15" />
          </div>

          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={continueAsGuest}
          >
            Continue as Guest
          </Button>
        </motion.div>
      </div>
    </section>
  );
}

function Field({
  id,
  label,
  icon: Icon,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  required,
}: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-darkberry-light/60" />
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className="pl-10"
        />
      </div>
    </div>
  );
}
