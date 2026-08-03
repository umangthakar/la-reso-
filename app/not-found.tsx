// ============================================================
// 404 — page not found
// ------------------------------------------------------------
// There was no custom not-found page, so a bad URL fell through to Next's
// unstyled default ("404 | This page could not be found") with none of the
// site's chrome. This one renders inside the root layout, so the navbar and
// footer are still there and the visitor has somewhere to go.
//
// Styling reuses the existing Tailwind design tokens (blush / wine / berry /
// dustyrose) and the same button treatment as the storefront CTAs — no new
// colours, fonts or spacing scales are introduced.
// ============================================================

import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  // A 404 must never be indexed as a real page.
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="mx-auto max-w-lg text-center">
        <p className="font-display text-6xl font-black text-dustyrose">404</p>
        <h1 className="mt-4 font-display text-3xl font-bold text-darkberry sm:text-4xl">
          We couldn&apos;t find that page
        </h1>
        <p className="mt-3 text-base text-darkberry-light">
          The link may be out of date, or the treat may have been renamed. Everything
          we bake is still on the menu.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/menu"
            className="inline-flex min-h-11 items-center rounded-full bg-wine px-6 py-3 font-semibold text-white transition-colors hover:bg-wine-dark"
          >
            Browse the menu
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-full border border-wine/30 px-6 py-3 font-semibold text-wine transition-colors hover:bg-blush-100"
          >
            Back home
          </Link>
        </div>
        <p className="mt-8 text-sm text-darkberry-light">
          Looking for something specific?{" "}
          <Link href="/contact" className="font-semibold text-wine underline underline-offset-2">
            Get in touch
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
