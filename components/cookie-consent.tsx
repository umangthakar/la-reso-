"use client";

// ============================================================
// Le Rasa — cookie consent banner + reopen button.
//
// Rendered once from the root layout, so it appears on every page. The root
// layout reads the consent cookie on the SERVER and passes it in as
// `initialConsent`, which is what makes this hydration-safe: the server and the
// first client render agree about whether the banner is open, so there is no
// mismatch and no flash of a banner for a visitor who already decided.
//
// Styling is entirely the existing design system — the site's <Button>, the
// `rounded-clay` radius and `shadow-clay` used by every card, the darkberry /
// wine / blush palette, and framer-motion as used elsewhere. Nothing new was
// designed and no shared component was modified.
//
// Layer: z-[55] sits above the sticky navbar (z-50) but below the cart drawer
// (z-[70]) and the modals (z-[100]), so the banner can never cover them.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  writeConsent,
  type CookieConsent as ConsentValue,
} from "@/lib/cookie-consent";

/** Bottom-centre on mobile (full width inside gutters), bottom-left from sm up. */
const POSITION =
  "fixed z-[55] bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-auto sm:w-[23rem]";

export function CookieConsent({
  initialConsent,
}: {
  initialConsent: ConsentValue | null;
}) {
  // Open on the very first visit only — i.e. when the server found no cookie.
  const [open, setOpen] = useState(initialConsent === null);
  const [decided, setDecided] = useState<ConsentValue | null>(initialConsent);
  const reduceMotion = useReducedMotion();

  // Focus is moved into the banner ONLY when the visitor reopens it themselves.
  // Stealing focus on first page load would yank a screen reader or keyboard
  // user out of the page they were reading.
  const reopenedRef = useRef(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && reopenedRef.current) panelRef.current?.focus();
  }, [open]);

  const choose = useCallback((value: ConsentValue) => {
    writeConsent(value);
    setDecided(value);
    reopenedRef.current = false;
    setOpen(false);
  }, []);

  const reopen = useCallback(() => {
    reopenedRef.current = true;
    setOpen(true);
  }, []);

  // Fade in + slide up, 300ms; fade out on decision.
  //
  // Reduced motion is handled by zeroing the DURATION, never by changing the
  // rendered `initial` styles. framer-motion's useReducedMotion reads matchMedia
  // eagerly on the first CLIENT render but returns null on the server, so
  // branching the styles on it makes the server emit
  // "opacity:0;transform:translateY(16px)" while the client emits "opacity:0" —
  // a hydration mismatch for every visitor who has reduced motion enabled.
  // Duration isn't part of the server-rendered style attribute, so varying it is
  // safe, and the result is the same: the banner appears at once, without motion.
  const duration = reduceMotion ? 0 : 0.3;
  const transition = { duration, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="cookie-banner"
            ref={panelRef}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={transition}
            className={POSITION}
            // Non-modal: the visitor can keep browsing and decide later, so the
            // page is never blocked and focus is never trapped. Escape is
            // deliberately NOT bound — it would have to mean accept or reject,
            // and recording a consent decision the visitor never made is worse
            // than asking for an explicit click.
            role="dialog"
            aria-modal="false"
            aria-labelledby="cookie-consent-title"
            aria-describedby="cookie-consent-description"
            tabIndex={-1}
          >
            <div className="rounded-clay bg-white p-5 shadow-clay ring-1 ring-darkberry/5 sm:p-6">
              <h2
                id="cookie-consent-title"
                className="font-display text-base font-semibold text-darkberry"
              >
                <span aria-hidden="true">🍪</span> We use cookies
              </h2>

              <p
                id="cookie-consent-description"
                className="mt-2 text-sm leading-relaxed text-darkberry-light"
              >
                We use essential cookies to make our website work and optional cookies
                to improve your experience, analyze traffic and enhance our services.
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button size="sm" className="w-full sm:flex-1" onClick={() => choose("accepted")}>
                  Accept All
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full sm:flex-1"
                  onClick={() => choose("rejected")}
                >
                  Reject All
                </Button>
              </div>

              <p className="mt-3 text-xs text-darkberry-light">
                <Link
                  href="/policies/cookie-policy"
                  className="font-semibold text-wine underline underline-offset-2 hover:text-darkberry focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wine focus-visible:ring-offset-2"
                >
                  Cookie Policy
                </Link>
                <span aria-hidden="true" className="px-1.5 text-darkberry/30">
                  ·
                </span>
                <Link
                  href="/privacy-policy"
                  className="font-semibold text-wine underline underline-offset-2 hover:text-darkberry focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wine focus-visible:ring-offset-2"
                >
                  Privacy Policy
                </Link>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Once a choice exists, a small button stays bottom-left so the visitor
          can change their mind — the only route back to the banner. */}
      <AnimatePresence>
        {!open && decided !== null && (
          <motion.button
            key="cookie-reopen"
            type="button"
            onClick={reopen}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={transition}
            aria-label="Cookie preferences"
            title="Cookie preferences"
            className="fixed bottom-4 left-4 z-[55] grid h-11 w-11 place-items-center rounded-full bg-white text-wine shadow-clay-sm ring-1 ring-darkberry/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wine focus-visible:ring-offset-2 sm:bottom-6 sm:left-6"
          >
            <Cookie className="h-5 w-5" aria-hidden="true" />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
