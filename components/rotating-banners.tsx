"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  BANNER_ICONS,
  DEFAULT_ROTATING_BANNERS,
  type RotatingBanner,
} from "@/lib/site-settings";
import { useActiveOffer } from "@/lib/use-active-offer";

// How long each banner stays before rotating to the next.
const ROTATE_MS = 5000;

// Hero-text sizing. The right column is at most RIGHT_COL_PX wide, and the hero
// block may not grow taller than HERO_MAX_H_PX or it would overflow the banner.
const RIGHT_COL_PX = 380;
const HERO_MAX_H_PX = 200;
const HERO_MAX_FONT_PX = 200;
const HERO_MIN_FONT_PX = 36;
// This display face measures ~0.69em per uppercase glyph; 0.72 buys a margin so
// a word never lands flush against the column edge and gets split by
// `break-words`. HERO_LEADING mirrors the rendered line-height.
const GLYPH_EM = 0.72;
const HERO_LEADING = 0.95;
// Words are fitted against slightly less than the full column, so the estimate
// erring high can still not trigger a mid-word break.
const HERO_FIT_W = RIGHT_COL_PX * 0.95;

/**
 * The largest font size at which `text` fits the right column: no word may
 * overflow the column's width, and the wrapped block may not exceed its height.
 * Returned in px against the reference column width, then re-expressed in `cqw`
 * by the caller. Wrapping is scale-invariant — font size and column width scale
 * together — so the line structure found here holds at every viewport.
 */
function fitHeroFontPx(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  for (let font = HERO_MAX_FONT_PX; font >= HERO_MIN_FONT_PX; font--) {
    const space = GLYPH_EM * font;
    let lines = 1;
    let lineWidth = 0;
    let wordFits = true;

    for (const word of words) {
      const width = GLYPH_EM * font * word.length;
      if (width > HERO_FIT_W) {
        wordFits = false;
        break;
      }
      if (lineWidth === 0) lineWidth = width;
      else if (lineWidth + space + width <= HERO_FIT_W) lineWidth += space + width;
      else {
        lines++;
        lineWidth = width;
      }
    }

    if (!wordFits) continue;
    if (lines * HERO_LEADING * font <= HERO_MAX_H_PX) return font;
  }
  return HERO_MIN_FONT_PX;
}

export function RotatingBanners({
  banners,
  count,
}: {
  banners: RotatingBanner[];
  count: number;
}) {
  // The resolved display offer drives the offer slide. It is NOT `primary`:
  // `display` is presentation-only and may be a coupon offer the admin chose to
  // advertise, whereas `primary` is the pricing offer. See /api/offers/active.
  const { offers: activeOffers } = useActiveOffer();
  const display = activeOffers.display;

  // The active offer becomes a slide built straight from its resolved display
  // content — the SAME OfferDisplay the admin Offer Preview and the home popup
  // render from, so all three always agree. Every offer TYPE works here:
  // the hero text is derived per type (30% OFF / £10 OFF / BUY 1 GET 1 FREE /
  // FREE DELIVERY / CHRISTMAS SALE) by lib/offers.ts, never assumed to be a
  // percentage.
  const offerSlide: RotatingBanner | null = useMemo(() => {
    // Nothing to show unless the offer carries banner copy.
    if (!display || !display.hasBanner) return null;
    return {
      type: "offer",
      heading: display.bannerTitle,
      subtext: display.bannerDescription,
      cta_text: display.ctaText,
      cta_link: display.ctaLink,
      watermark_text: display.heroText,
      // The offer's right side is its own choice: the big hero text, or a
      // promotional image that replaces it entirely.
      right_content_type: display.heroDisplayMode === "image" ? "image" : "highlight",
      right_image_url: display.heroImageUrl,
      enabled: true,
    };
  }, [display]);

  // Only enabled banners rotate; if none are enabled fall back to the first
  // default banner so the Menu page never looks empty. An active offer either
  // replaces a stored "offer" banner (no duplicate) or is prepended.
  const slides = useMemo(() => {
    const enabled = banners.filter((b) => b.enabled);
    const base = enabled.length > 0 ? enabled : [DEFAULT_ROTATING_BANNERS[0]];
    if (!offerSlide) return base;
    return base.some((b) => b.type === "offer")
      ? base.map((b) => (b.type === "offer" ? offerSlide : b))
      : [offerSlide, ...base];
  }, [banners, offerSlide]);

  const [index, setIndex] = useState(0);

  // Keep the index valid if the banner list changes (e.g. admin edit).
  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [slides.length, index]);

  // Auto-rotate every 5s. Single-slide lists don't rotate.
  useEffect(() => {
    if (slides.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  const current = slides[Math.min(index, slides.length - 1)];
  const icon = BANNER_ICONS[current.type] ?? "";

  // Right-side content belongs to the CURRENT slide alone. It used to be read
  // off the active offer, which leaked that offer's "30%" highlight onto every
  // banner in the rotation; each slide now decides for itself.
  const rightImage =
    current.right_content_type === "image" ? current.right_image_url.trim() : "";

  // An active offer's background image backs the offer slide only, behind a
  // blush scrim so the heading keeps its contrast. Other slides stay flat blush.
  const isOfferSlide = offerSlide !== null && current === offerSlide;
  const bannerImage = isOfferSlide ? display?.backgroundImageUrl ?? "" : "";

  // Highlight precedence: this banner's own watermark, then the product count.
  // Trim first — a whitespace-only watermark is "unset", not a blank highlight.
  //
  // The product-count fallback is for the DECORATIVE slides only. An offer slide
  // whose hero text resolved to nothing must render nothing: falling back there
  // printed a stray "9" next to the offer's copy.
  const highlight = rightImage
    ? ""
    : current.watermark_text.trim() || (isOfferSlide ? "" : String(count));

  // The offer slide already carries the offer's own copy, so every slide simply
  // renders its own fields.
  const { heading, subtext, cta_text: ctaText, cta_link: ctaLink } = current;

  // The hero text has to fit the right-hand column instead of spilling across
  // the banner, so its size is fitted to that column rather than fixed at 200px.
  // `1cqw` is 1% of the column's own width, which is what makes it scale with
  // the space actually available. A short highlight ("9") still renders as large
  // as it always has; a long one ("FREE DELIVERY") shrinks and wraps.
  // The lower bound is a CSS variable, not a constant: the mobile column is far
  // narrower than the desktop one, so it needs a smaller floor. `--hero-min` is
  // set per breakpoint on the column below, leaving desktop sizing untouched.
  const heroFontSize = useMemo(() => {
    const fontPx = fitHeroFontPx(highlight);
    if (fontPx === 0) return undefined;
    const cqw = (fontPx / RIGHT_COL_PX) * 100;
    const fallback = `${HERO_MIN_FONT_PX / 16}rem`;
    return `clamp(var(--hero-min, ${fallback}), ${cqw.toFixed(2)}cqw, ${fontPx}px)`;
  }, [highlight]);

  return (
    // `pb-36` on mobile only: it is the room the bottom-right highlight occupies,
    // keeping it clear of the CTA and the dots. From md up the highlight is back
    // in its own column and the padding is the original py-16.
    <section
      className="relative w-full overflow-hidden bg-[#F9EEEA] px-8 pb-36 pt-16 md:py-16"
      style={
        bannerImage
          ? {
              backgroundImage: `linear-gradient(to right, rgba(249,238,234,0.94), rgba(249,238,234,0.7)), url(${bannerImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      {/* Right-side content, per banner: either the decorative highlight text
          or the banner's own image.

          From md up this is the vertically-centred right column it has always
          been. Below md there is no room beside the copy, so it anchors to the
          bottom-right corner instead — clear of the heading, the subtext and
          the CTA (which are all left-aligned and end above it) — and shrinks
          with its own width. It used to be `hidden md:block`, which is why the
          highlight vanished on mobile entirely. */}
      <div className="pointer-events-none absolute bottom-4 right-4 select-none md:bottom-auto md:right-6 md:top-1/2 md:-translate-y-1/2">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            {rightImage ? (
              // Banner images render at every breakpoint: a small mobile-first
              // size (tucked in the same bottom-right corner as the highlight)
              // that scales up to the unchanged desktop values from md. Aspect
              // ratio preserved (object-contain), right-aligned (object-right).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={rightImage}
                alt=""
                aria-hidden
                className="block h-[80px] w-[26vw] max-w-[120px] object-contain object-right sm:h-[110px] sm:max-w-[150px] md:h-[200px] md:w-[26vw] md:max-w-[300px] lg:h-[240px]"
              />
            ) : highlight ? (
              // The fixed-width query container is what bounds the hero text:
              // it can no longer grow past this column into the left copy, and
              // `cqw` in heroFontSize resolves against this width. Narrower on
              // mobile, so the same cqw ratio yields a proportionally smaller
              // font — the highlight shrinks rather than disappearing.
              <div className="w-[42vw] max-w-[200px] [--hero-min:1.25rem] [container-type:inline-size] md:w-[34vw] md:max-w-[380px] md:[--hero-min:2.25rem]">
                <span
                  className="block break-words text-right font-display font-black leading-[0.95] tracking-tight text-[#7A2E4D]/50"
                  style={{ fontSize: heroFontSize }}
                >
                  {highlight}
                </span>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Rotating content — cross-fades between banners. Fixed min-height so
          the banner keeps the same height as the old hero (no layout jump).
          From md up (where the right column appears) the copy is also capped to
          58% so it can never run underneath that column; below md the right
          column is hidden and the full max-w-2xl applies as before. */}
      <div className="relative min-h-[210px] max-w-2xl md:min-h-[240px] md:max-w-[min(42rem,58%)]">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            {icon && (
              <span className="mb-2 block text-4xl leading-none" aria-hidden>
                {icon}
              </span>
            )}
            <h2 className="font-display text-5xl font-bold leading-tight text-[#612437] md:text-7xl">
              {heading}
            </h2>
            {subtext && (
              <p className="mt-4 text-[#9C616D]">{subtext}</p>
            )}
            {ctaText && ctaLink && (
              <Link
                href={ctaLink}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-wine px-6 py-3 text-sm font-semibold text-blush-50 shadow-clay-sm transition-transform hover:-translate-y-0.5"
              >
                {ctaText}
              </Link>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dot indicators */}
      {slides.length > 1 && (
        <div className="relative mt-6 flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Show banner ${i + 1}`}
              aria-current={i === index}
              className={`h-2.5 rounded-full transition-all ${
                i === index ? "w-7 bg-wine" : "w-2.5 bg-[#D5A4A4] hover:bg-[#c58e8e]"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
