"use client";

// ============================================================
// Le Rasa — cookie consent banner, preferences modal and reopen button.
//
// Rendered once from the root layout, so it appears on every page. The root
// layout reads the consent cookie on the SERVER and passes it in as
// `initialConsent`, which is what makes this hydration-safe: the server and the
// first client render agree about whether the banner is open, so there is no
// mismatch and no flash of a banner for a visitor who already decided.
//
// Styling is entirely the existing design system — the site's <Button>, the
// `rounded-clay` radius and `shadow-clay` used by every card, the darkberry /
// wine / blush palette, and framer-motion as used elsewhere. The modal mirrors
// the established overlay pattern in components/home/offer-popup.tsx (same
// backdrop, same z-[100], same entry transition). Nothing new was designed and
// no shared component was modified.
//
// Layers: the banner sits at z-[55], above the sticky navbar (z-50) but below
// the cart drawer (z-[70]); the modal sits at z-[100] with the other modals.
// ============================================================

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Cookie, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  acceptAllChoices,
  isLegacyRawValue,
  makeConsent,
  readRawConsentCookie,
  rejectAllChoices,
  writeConsent,
  type ConsentChoices,
  type ConsentRecord,
} from "@/lib/cookie-consent";

/** Bottom-centre on mobile (full width inside gutters), bottom-left from sm up. */
const POSITION =
  "fixed z-[55] bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-auto sm:w-[23rem]";

/** The optional categories, in display order. Add one here and it appears in the
 *  modal; the storage layer only needs the matching key on ConsentChoices. */
const OPTIONAL_CATEGORIES: {
  key: keyof ConsentChoices;
  title: string;
  description: string;
}[] = [
  {
    key: "analytics",
    title: "Analytics Cookies",
    description:
      "Help us understand how the site is used so we can improve it. Off by default.",
  },
  {
    key: "marketing",
    title: "Marketing Cookies",
    description:
      "Used to measure and personalise the offers you see. Off by default.",
  },
];

export function CookieConsent({
  initialConsent,
}: {
  initialConsent: ConsentRecord | null;
}) {
  // Open on the very first visit only — i.e. when the server found no cookie.
  const [bannerOpen, setBannerOpen] = useState(initialConsent === null);
  const [modalOpen, setModalOpen] = useState(false);
  const [decided, setDecided] = useState<ConsentRecord | null>(initialConsent);
  const reduceMotion = useReducedMotion();

  // The banner never takes focus on arrival — stealing it on page load would
  // yank a screen reader or keyboard user out of the page they were reading.
  // The MODAL does take focus, because the visitor opened it deliberately.

  // Fade in + slide up, 300ms; fade out on decision.
  //
  // Reduced motion is handled by zeroing the DURATION, never by changing the
  // rendered `initial` styles. framer-motion's useReducedMotion reads matchMedia
  // eagerly on the first CLIENT render but returns null on the server, so
  // branching the styles on it makes the server emit
  // "opacity:0;transform:translateY(16px)" while the client emits "opacity:0" —
  // a hydration mismatch for every visitor who has reduced motion enabled.
  // Duration isn't part of the server-rendered style attribute, so varying it is
  // safe, and the result is the same: things appear at once, without motion.
  const duration = reduceMotion ? 0 : 0.3;
  const transition = { duration, ease: [0.22, 1, 0.36, 1] as const };

  // Finish migrating a pre-v1 cookie ("accepted"/"rejected") to the structured
  // record. The visitor's choice was already honoured on read; this just
  // persists it in the current format so it only happens once.
  useEffect(() => {
    if (!decided) return;
    if (isLegacyRawValue(readRawConsentCookie())) writeConsent(decided);
    // Intentionally on mount only: the raw cookie can only be legacy on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback((choices: ConsentChoices) => {
    const record = writeConsent(makeConsent(choices));
    setDecided(record);
    setModalOpen(false);
    setBannerOpen(false);
  }, []);

  return (
    <>
      <AnimatePresence>
        {bannerOpen && (
          <motion.div
            key="cookie-banner"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={transition}
            className={POSITION}
            // Non-modal: the visitor can keep browsing and decide later, so the
            // page is never blocked and focus is never trapped. Escape is
            // deliberately NOT bound here — it would have to mean accept or
            // reject, and recording a consent decision the visitor never made is
            // worse than asking for an explicit click. (The MODAL below does
            // bind Escape, because there it means "cancel", not "decide".)
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
                <Button
                  size="sm"
                  className="w-full sm:flex-1"
                  onClick={() => save(acceptAllChoices)}
                >
                  Accept All
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full sm:flex-1"
                  onClick={() => save(rejectAllChoices)}
                >
                  Reject All
                </Button>
              </div>

              {/* Third action, full width beneath the pair: it is a different
                  kind of choice (opens a dialog rather than deciding), so it
                  reads as a link-weight button instead of competing with them. */}
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="mt-2 w-full rounded-full px-4 py-2 text-sm font-semibold text-darkberry underline underline-offset-2 transition-colors hover:bg-wine/10 hover:text-wine-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wine focus-visible:ring-offset-2"
              >
                Manage Preferences
              </button>

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

      <PreferencesModal
        open={modalOpen}
        current={decided}
        transition={transition}
        onClose={() => setModalOpen(false)}
        onSave={save}
      />

      {/* Once a choice exists, a small button stays bottom-left so the visitor
          can change their mind. It opens the preferences dialog directly. */}
      <AnimatePresence>
        {!bannerOpen && !modalOpen && decided !== null && (
          <motion.button
            key="cookie-reopen"
            type="button"
            onClick={() => setModalOpen(true)}
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

// ============================================================
// Preferences dialog
// ============================================================

function PreferencesModal({
  open,
  current,
  transition,
  onClose,
  onSave,
}: {
  open: boolean;
  current: ConsentRecord | null;
  transition: { duration: number; ease: readonly [number, number, number, number] };
  onClose: () => void;
  onSave: (choices: ConsentChoices) => void;
}) {
  // Seeded from the saved record, or both OFF for a first-time visitor —
  // optional cookies are never on until the visitor turns them on.
  const [choices, setChoices] = useState<ConsentChoices>({
    analytics: current?.analytics ?? false,
    marketing: current?.marketing ?? false,
  });

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<Element | null>(null);
  const titleId = useId();
  const descId = useId();

  // Re-seed each time it opens, so closing without saving discards the edits
  // rather than leaving them staged for next time.
  useEffect(() => {
    if (open) {
      setChoices({
        analytics: current?.analytics ?? false,
        marketing: current?.marketing ?? false,
      });
    }
  }, [open, current]);

  // Escape cancels. Unlike the banner, that is unambiguous here: closing the
  // dialog records nothing.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // aria-modal="true" promises the rest of the page is inert, so focus is moved
  // in, kept inside while it is open, and returned to whatever opened it.
  useEffect(() => {
    if (!open) {
      (restoreFocusRef.current as HTMLElement | null)?.focus?.();
      return;
    }
    restoreFocusRef.current = document.activeElement;
    dialogRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
        >
          {/* Backdrop — same treatment as the site's other modals. */}
          <div
            className="absolute inset-0 bg-darkberry/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={transition}
            className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-clay bg-white p-6 shadow-clay ring-1 ring-darkberry/5 sm:p-8"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close cookie preferences"
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-darkberry-light transition-colors hover:bg-wine/10 hover:text-wine-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wine focus-visible:ring-offset-2"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <h2
              id={titleId}
              className="pr-10 font-display text-xl font-semibold text-darkberry"
            >
              Cookie Preferences
            </h2>
            <p id={descId} className="mt-2 text-sm leading-relaxed text-darkberry-light">
              Choose which categories of cookies you would like to allow.
            </p>

            <div className="mt-6 space-y-3">
              {/* Essential — shown as a locked row, never a working control. */}
              <div className="rounded-2xl bg-blush-100/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-display text-sm font-semibold text-darkberry">
                    Essential Cookies
                  </h3>
                  <span className="shrink-0 rounded-full bg-wine/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-wine-dark">
                    Always Active
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-darkberry-light">
                  Required for website functionality. These cannot be disabled.
                </p>
              </div>

              {OPTIONAL_CATEGORIES.map((category) => (
                <div key={category.key} className="rounded-2xl bg-blush-100/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-display text-sm font-semibold text-darkberry">
                      {category.title}
                    </h3>
                    <Toggle
                      checked={choices[category.key]}
                      label={category.title}
                      onChange={(value) =>
                        setChoices((prev) => ({ ...prev, [category.key]: value }))
                      }
                    />
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-darkberry-light">
                    {category.description}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button size="sm" className="w-full sm:flex-1" onClick={() => onSave(choices)}>
                Save Preferences
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="w-full sm:flex-1"
                onClick={() => onSave(acceptAllChoices)}
              >
                Accept All
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="w-full sm:flex-1"
                onClick={() => onSave(rejectAllChoices)}
              >
                Reject All
              </Button>
            </div>

            <p className="mt-4 text-xs text-darkberry-light">
              <Link
                href="/policies/cookie-policy"
                className="font-semibold text-wine underline underline-offset-2 hover:text-darkberry"
              >
                Cookie Policy
              </Link>
              <span aria-hidden="true" className="px-1.5 text-darkberry/30">
                ·
              </span>
              <Link
                href="/privacy-policy"
                className="font-semibold text-wine underline underline-offset-2 hover:text-darkberry"
              >
                Privacy Policy
              </Link>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A switch built from a native button — no new dependency, and it carries the
 *  right role/state for assistive tech out of the box. */
function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wine focus-visible:ring-offset-2 ${
        checked ? "bg-wine" : "bg-dustyrose/60"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-[1.125rem] w-[1.125rem] transform rounded-full bg-white shadow-sm transition-transform duration-300 ${
          checked ? "translate-x-[1.55rem]" : "translate-x-1"
        }`}
      />
    </button>
  );
}
