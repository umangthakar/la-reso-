"use client";

// ============================================================
// Le Rasa Bakery — home-page offer popup
//
// Replaces the old top announcement bar as the place an active offer is
// announced. Every string and the image come from the SAME resolved
// OfferDisplay the admin Offer Preview and the Menu rotating banner read (via
// useActiveOffer), so there is exactly one source of truth and nothing —
// including the button's destination — is hardcoded.
//
// Works for every offer type: an offer that sets no popup_* fields inherits its
// banner copy, so percentage, fixed-amount, buy-X-get-Y, free-delivery, coupon
// and custom/seasonal offers all announce themselves here.
//
// Timing contract: the offer is fetched immediately on mount; the countdown
// starts only once that fetch has resolved, and then runs for a fixed 3s — the
// fetch time is never added to it. No active offer means no popup. Shown once
// per browser session (sessionStorage), dismissible via the X, backdrop or Esc.
//
// The countdown is keyed on the offer's ID, NOT on the offer object. Every
// component that calls useActiveOffer() re-fetches on mount, and each resolved
// fetch broadcasts a freshly-parsed object to all subscribers. A product grid
// mounts dozens of those, so depending on the object identity here restarted
// the timer on every broadcast — the popup would surface late, or never.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useActiveOffer } from "@/lib/use-active-offer";

/** Marked as soon as the popup is shown, so it appears once per session. */
const SESSION_KEY = "lerasa:offer-popup-seen";
const SHOW_AFTER_MS = 3000;

/** Copy used only when the offer itself carries no message. */
const FALLBACK_MESSAGE = "Check out our latest offers on the Menu page.";

export function OfferPopup() {
  const { offers, loading } = useActiveOffer();
  // The display offer, not the pricing offer — a coupon the admin has written
  // banner copy for should announce itself here too.
  const offer = offers.display;
  const [open, setOpen] = useState(false);

  const dismiss = useCallback(() => setOpen(false), []);

  // A stable dependency. `offer` is a new object on every broadcast even when
  // it describes the same offer, so keying the effect on it reset the pending
  // timeout each time; the id only changes when the offer genuinely does.
  const offerId = offer?.id ?? null;

  // Arm the countdown once the offer has resolved, and let it run to the end.
  useEffect(() => {
    if (loading || !offerId) return;
    try {
      if (window.sessionStorage.getItem(SESSION_KEY)) return;
    } catch {
      /* storage unavailable (private mode) — still show it */
    }

    const id = setTimeout(() => {
      setOpen(true);
      try {
        window.sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* non-fatal */
      }
    }, SHOW_AFTER_MS);

    return () => clearTimeout(id);
  }, [loading, offerId]);

  // Escape closes, matching the backdrop click.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!offer) return null;

  // All content is offer-derived. resolveOfferDisplay() already applied the
  // popup -> banner -> name fallback chain, so these are just reads.
  const title = offer.popupTitle;
  const message = offer.popupDescription || FALLBACK_MESSAGE;
  const highlight = offer.heroText;
  const ctaText = offer.popupCtaText;
  const ctaLink = offer.popupCtaLink;
  const image = offer.popupImageUrl;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-darkberry/50 backdrop-blur-sm"
            onClick={dismiss}
            aria-hidden
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="offer-popup-title"
            className="relative w-full max-w-md overflow-hidden rounded-clay bg-blush-50 shadow-glow"
            initial={{ opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              type="button"
              onClick={dismiss}
              aria-label="Close offer"
              className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-blush-50/85 text-wine-dark backdrop-blur transition-colors hover:bg-wine hover:text-blush-50"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Rendered as a CSS background (not next/image) for the same reason
                the rotating banner does: banner_image_url is a free-text admin
                field and may point at a host outside the next/image allow-list. */}
            {image && (
              <div
                className="relative aspect-[16/9] w-full bg-cover bg-center"
                style={{ backgroundImage: `url(${image})` }}
                aria-hidden
              >
                <div className="absolute inset-0 bg-gradient-to-t from-blush-50 via-blush-50/10 to-transparent" />
              </div>
            )}

            <div className="px-6 pb-7 pt-5 text-center sm:px-8">
              {highlight && (
                <span className="mb-3 inline-block rounded-full bg-wine px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-blush-50">
                  {highlight}
                </span>
              )}

              <h2
                id="offer-popup-title"
                className="font-display text-2xl font-bold leading-snug text-darkberry sm:text-3xl"
              >
                <span aria-hidden>🎉 </span>
                {title}
              </h2>

              <p className="mt-2.5 text-sm leading-relaxed text-darkberry-light sm:text-base">
                {message}
              </p>

              <div className="mt-6 flex flex-col-reverse items-center gap-2.5 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={dismiss}
                  className="w-full rounded-full px-5 py-2.5 text-sm font-semibold text-wine-dark transition-colors hover:bg-wine/10 sm:w-auto"
                >
                  Maybe later
                </button>
                <Link
                  href={ctaLink}
                  onClick={dismiss}
                  className="w-full rounded-full bg-wine px-6 py-3 text-center text-sm font-semibold text-blush-50 shadow-clay-sm transition-all hover:-translate-y-0.5 hover:bg-wine-dark sm:w-auto"
                >
                  {ctaText}
                </Link>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
