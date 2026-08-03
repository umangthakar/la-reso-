"use client";

// ============================================================
// Route error boundary
// ------------------------------------------------------------
// Without this, an unhandled render error anywhere in the app showed Next's
// bare "Application error: a client-side exception has occurred" screen — no
// branding, no way back, and no hint that the basket is still intact.
//
// This boundary renders inside the root layout, so the navbar and footer stay
// put, and it offers `reset()` first: most failures here are a transient data
// fetch, and retrying re-renders the segment without a full page load.
//
// Styling reuses the existing design tokens only.
// ============================================================

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in the server logs / browser console with the digest, which is
    // the only handle you get on a minified production stack trace.
    console.error("[app/error] unhandled render error", {
      message: error?.message,
      digest: error?.digest,
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="mx-auto max-w-lg text-center">
        <h1 className="font-display text-3xl font-bold text-darkberry sm:text-4xl">
          Something went wrong
        </h1>
        <p className="mt-3 text-base text-darkberry-light">
          Sorry — that didn&apos;t load properly. Your basket is safe. Try again, or
          head back to the menu.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center rounded-full bg-wine px-6 py-3 font-semibold text-white transition-colors hover:bg-wine-dark"
          >
            Try again
          </button>
          <Link
            href="/menu"
            className="inline-flex min-h-11 items-center rounded-full border border-wine/30 px-6 py-3 font-semibold text-wine transition-colors hover:bg-blush-100"
          >
            Back to the menu
          </Link>
        </div>
        {error?.digest && (
          <p className="mt-8 text-xs text-darkberry-light">
            If you contact us, quote reference{" "}
            <span className="font-semibold">{error.digest}</span>.
          </p>
        )}
      </div>
    </div>
  );
}
