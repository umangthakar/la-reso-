"use client";

// ============================================================
// Le Rasa — the offer popup's card, and the background treatment behind it.
//
// Split out of offer-popup.tsx so the admin Offer Preview renders the SAME
// card customers see instead of a hand-maintained mock that drifted from it.
// This file owns the visuals only: no data fetching, no session storage, no
// timing, no modal behaviour — OfferPopup still owns all of that.
//
// The shell classes live in OFFER_POPUP_CARD_CLASS rather than on a wrapper
// here, so the live popup can keep applying them to its own motion.div and the
// entrance animation is untouched.
// ============================================================

import Link from "next/link";
import { X } from "lucide-react";

// ---------- Background treatment -------------------------------------------
// Five stacked layers sit behind the card's content, in this order:
//   far field -> near field -> warm light -> readability scrim -> vignette.
// Everything below is decoration only; none of it changes the card's layout.

/**
 * The dessert scene used when the offer carries no popup image: cake, chocolate
 * splash, strawberries, blueberries, macarons, gold confetti and bokeh, drawn
 * as a few-KB SVG so the popup never falls back to a plain panel.
 */
const FALLBACK_SCENE = "url(/images/offer-popup-scene.svg)";

/**
 * Keeps the middle of the frame in focus and lets the edges fall away, so the
 * two blurred copies below read as depth of field rather than a flat smear.
 */
const DOF_MASK =
  "radial-gradient(ellipse 64% 58% at 50% 42%, #000 0%, #000 34%, rgba(0,0,0,0.45) 62%, transparent 82%)";

/** Golden highlights and the glow around the desserts (screened, so it lifts). */
const WARM_LIGHT = [
  "radial-gradient(ellipse 58% 42% at 24% 6%, rgba(255,206,138,0.26), rgba(255,206,138,0) 72%)",
  "radial-gradient(ellipse 44% 34% at 82% 26%, rgba(255,188,116,0.18), rgba(255,188,116,0) 74%)",
  "radial-gradient(ellipse 52% 38% at 50% 46%, rgba(255,232,196,0.14), rgba(255,232,196,0) 76%)",
].join(", ");

/**
 * The dark luxury scrim: ~16% at the top, ~50% through the middle where the
 * headline and body copy sit, ~36% at the foot. Enough contrast for the text,
 * light enough that the artwork still shows through everywhere.
 */
const READABILITY_SCRIM =
  "linear-gradient(180deg, rgba(36,15,21,0.16) 0%, rgba(36,15,21,0.24) 22%, rgba(34,14,20,0.48) 44%, rgba(34,14,20,0.55) 64%, rgba(32,13,19,0.45) 86%, rgba(32,13,19,0.36) 100%)";

/** Edge falloff. */
const VIGNETTE =
  "radial-gradient(ellipse 76% 66% at 50% 48%, rgba(24,9,14,0) 42%, rgba(24,9,14,0.34) 76%, rgba(24,9,14,0.62) 100%)";

/** The card shell. Applied by the caller so the live popup keeps animating it. */
export const OFFER_POPUP_CARD_CLASS =
  "relative w-full max-w-md overflow-hidden rounded-clay bg-[#2a1410] shadow-glow ring-1 ring-inset ring-[#e8c88a]/20";

/**
 * The artwork stack behind the card. `image` is the admin's popup image when
 * one is set; otherwise the drawn scene stands in, so the popup never falls
 * back to a plain panel. The admin only ever supplies the image — every effect
 * below is applied automatically and identically either way.
 */
function PopupArtwork({ image }: { image: string }) {
  const scene = image ? `url(${image})` : FALLBACK_SCENE;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Far field — the softly blurred edges of the frame. Both copies are
          scaled up so the blur never feathers into the card's corners. */}
      <div
        className="absolute inset-0 scale-[1.14] bg-cover bg-center"
        style={{ backgroundImage: scene, filter: "blur(9px) saturate(1.06)" }}
      />
      {/* Near field — the same artwork barely softened, masked to the middle. */}
      <div
        className="absolute inset-0 scale-[1.14] bg-cover bg-center"
        style={{
          backgroundImage: scene,
          filter: "blur(2.5px) saturate(1.06)",
          WebkitMaskImage: DOF_MASK,
          maskImage: DOF_MASK,
        }}
      />
      <div
        className="absolute inset-0 mix-blend-screen"
        style={{ backgroundImage: WARM_LIGHT }}
      />
      <div className="absolute inset-0" style={{ backgroundImage: READABILITY_SCRIM }} />
      <div className="absolute inset-0" style={{ backgroundImage: VIGNETTE }} />
    </div>
  );
}

export type OfferPopupCardProps = {
  title: string;
  message: string;
  /** The pill above the title. Omitted when the offer resolves no hero text. */
  highlight: string;
  ctaText: string;
  ctaLink: string;
  /** The admin's popup image; blank falls back to the drawn scene. */
  image: string;
  onDismiss: () => void;
  /**
   * The admin preview renders the same markup but must not navigate away or
   * close anything, so its CTA is a span and its buttons are inert. Defaults to
   * the live behaviour.
   */
  preview?: boolean;
};

/**
 * The card's contents. The caller supplies the shell element (and, on the
 * storefront, its animation) with {@link OFFER_POPUP_CARD_CLASS}.
 */
export function OfferPopupCard({
  title,
  message,
  highlight,
  ctaText,
  ctaLink,
  image,
  onDismiss,
  preview = false,
}: OfferPopupCardProps) {
  return (
    <>
      {/* Rendered as a CSS background (not next/image) for the same reason
          the rotating banner does: popup_image_url is a free-text admin
          field and may point at a host outside the next/image allow-list. */}
      <PopupArtwork image={image} />

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Close offer"
        tabIndex={preview ? -1 : undefined}
        className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-blush-50/85 text-wine-dark backdrop-blur transition-colors hover:bg-wine hover:text-blush-50"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Spacer only. The image itself is part of the artwork stack now,
          but an offer that ships one still gets the same 16:9 headroom
          above the copy that it always had. */}
      {image && <div className="relative aspect-[16/9] w-full" aria-hidden />}

      <div className="relative px-6 pb-7 pt-5 text-center sm:px-8">
        {highlight && (
          <span className="mb-3 inline-block rounded-full bg-wine px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-blush-50 shadow-[0_6px_20px_rgba(20,8,12,0.45)]">
            {highlight}
          </span>
        )}

        {/* Light copy from here down — the panel behind it is artwork, not
            blush cream. Sizes, weights and spacing are unchanged. */}
        <h2
          id="offer-popup-title"
          className="font-display text-2xl font-bold leading-snug text-blush-50 [text-shadow:0_2px_18px_rgba(20,8,12,0.6)] sm:text-3xl"
        >
          <span aria-hidden>🎉 </span>
          {title}
        </h2>

        <p className="mt-2.5 text-sm leading-relaxed text-blush-100/90 [text-shadow:0_1px_12px_rgba(20,8,12,0.55)] sm:text-base">
          {message}
        </p>

        <div className="mt-6 flex flex-col-reverse items-center gap-2.5 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onDismiss}
            tabIndex={preview ? -1 : undefined}
            className="w-full rounded-full px-5 py-2.5 text-sm font-semibold text-blush-100/85 transition-colors hover:bg-blush-50/10 hover:text-blush-50 sm:w-auto"
          >
            Maybe later
          </button>
          {/* shadow-clay-sm's white outer glow only reads on the blush
              panel; over artwork it needs a dark elevation instead. */}
          {preview ? (
            <span className="w-full rounded-full bg-wine px-6 py-3 text-center text-sm font-semibold text-blush-50 shadow-[0_10px_28px_-8px_rgba(16,6,10,0.75)] sm:w-auto">
              {ctaText}
            </span>
          ) : (
            <Link
              href={ctaLink}
              onClick={onDismiss}
              className="w-full rounded-full bg-wine px-6 py-3 text-center text-sm font-semibold text-blush-50 shadow-[0_10px_28px_-8px_rgba(16,6,10,0.75)] transition-all hover:-translate-y-0.5 hover:bg-wine-dark sm:w-auto"
            >
              {ctaText}
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
