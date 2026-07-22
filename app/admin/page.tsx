"use client";

// ============================================================
// Le Rasa Bakery — Admin login
// Simple shared-password gate. On success, stores the password in
// sessionStorage (used to authorise admin API calls) and goes to the
// dashboard. See lib/admin-auth.ts.
// ============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_AUTH_KEY, isValidEmail } from "@/lib/admin-auth";
import { useSiteSettings } from "@/lib/use-site-settings";

const BLUSH = "#F9EEEA";
const WINE = "#873853";
const BERRY = "#5C2A41";

export default function AdminLoginPage() {
  const router = useRouter();
  const { settings } = useSiteSettings();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    // Client-side validation (the server re-checks both).
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        // Session handling is unchanged: the password is what authorises admin
        // API calls (x-admin-auth header), so it's what we persist.
        window.sessionStorage.setItem(ADMIN_AUTH_KEY, password);
        router.push("/admin/dashboard");
      } else if (res.status === 401) {
        setError("Incorrect email or password. Please try again.");
        setPassword("");
      } else {
        setError("Sign in is unavailable right now. Please try again later.");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BLUSH,
        padding: "1.5rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "white",
          borderRadius: 20,
          padding: "2.5rem 2rem",
          boxShadow: "0 20px 50px rgba(135,56,83,0.12)",
        }}
      >
        <h1
          style={{
            margin: 0,
            textAlign: "center",
            color: WINE,
            fontSize: "1.6rem",
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          {settings.branding.name}
        </h1>
        <p style={{ textAlign: "center", color: BERRY, opacity: 0.7, marginTop: 6, marginBottom: 28 }}>
          Admin sign in
        </p>

        <label htmlFor="email" style={{ display: "block", color: BERRY, fontWeight: 600, marginBottom: 8 }}>
          Email
        </label>
        <input
          id="email"
          type="email"
          autoFocus
          autoComplete="username"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError("");
          }}
          placeholder="Enter admin email"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 14px",
            borderRadius: 12,
            border: `1px solid ${error ? "#d9534f" : "rgba(135,56,83,0.25)"}`,
            fontSize: "1rem",
            outline: "none",
            color: BERRY,
            marginBottom: 18,
          }}
        />

        <label htmlFor="password" style={{ display: "block", color: BERRY, fontWeight: 600, marginBottom: 8 }}>
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
          }}
          placeholder="Enter admin password"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 14px",
            borderRadius: 12,
            border: `1px solid ${error ? "#d9534f" : "rgba(135,56,83,0.25)"}`,
            fontSize: "1rem",
            outline: "none",
            color: BERRY,
          }}
        />

        {error && (
          <p style={{ color: "#d9534f", fontSize: "0.875rem", marginTop: 10, marginBottom: 0 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            marginTop: 24,
            padding: "12px 16px",
            borderRadius: 12,
            border: "none",
            background: WINE,
            color: "white",
            fontSize: "1rem",
            fontWeight: 700,
            cursor: submitting ? "default" : "pointer",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
