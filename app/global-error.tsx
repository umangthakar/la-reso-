"use client";

// ============================================================
// Root error boundary — the last resort
// ------------------------------------------------------------
// Catches a failure in the ROOT LAYOUT itself (e.g. the settings read or the
// font loader throwing). At that point app/error.tsx cannot help, because the
// layout that would have wrapped it is the thing that broke — so this file has
// to supply its own <html> and <body>.
//
// For the same reason it cannot rely on Tailwind classes or the brand fonts:
// the stylesheet is imported by the layout that failed. The brand palette is
// therefore inlined here as literal hex values — the same
// #F9EEEA / #873853 / #612437 used everywhere else — so the page still looks
// like Le Rasa rather than an unstyled browser error.
// ============================================================

import { useEffect } from "react";

const BLUSH = "#F9EEEA";
const WINE = "#873853";
const BERRY = "#612437";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/global-error] root layout failure", {
      message: error?.message,
      digest: error?.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BLUSH,
          color: BERRY,
          padding: "1.5rem",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.01em" }}>
            Le Rasa Bakery
          </h1>
          <p style={{ marginTop: 16, fontSize: "1.05rem", fontWeight: 600 }}>
            The site is having a moment
          </p>
          <p style={{ marginTop: 8, opacity: 0.75, lineHeight: 1.6 }}>
            Something went wrong while loading the page. Please try again — if it keeps
            happening, call us and we&apos;ll take your order directly.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 28,
              minHeight: 44,
              padding: "12px 24px",
              borderRadius: 999,
              border: "none",
              background: WINE,
              color: "white",
              fontSize: "1rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error?.digest && (
            <p style={{ marginTop: 24, fontSize: "0.75rem", opacity: 0.6 }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
