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

export function RotatingBanners({
  banners,
  count,
}: {
  banners: RotatingBanner[];
  count: number;
}) {
  // Live active offer drives the offer slide + the highlight watermark.
  const { offers: activeOffers } = useActiveOffer();
  const activeOffer = activeOffers.primary;

  // The active offer becomes a slide built straight from its own `offers` row —
  // the SAME record the admin Offer Preview renders from, so the two always
  // agree. Previously the offer's content could only override a stored banner
  // whose type happened to be "offer"; when the admin had no such banner (the
  // common case) the offer never appeared here at all.
  const offerSlide: RotatingBanner | null = useMemo(() => {
    if (!activeOffer) return null;
    const heading = activeOffer.hero_heading?.trim() ?? "";
    const subtext = activeOffer.hero_subtext?.trim() ?? "";
    // Nothing to show unless the offer carries banner copy.
    if (!heading && !subtext) return null;
    return {
      type: "offer",
      heading,
      subtext,
      cta_text: activeOffer.cta_text?.trim() ?? "",
      cta_link: activeOffer.cta_link?.trim() ?? "",
      watermark_text: activeOffer.hero_highlight_text?.trim() ?? "",
      // The offer slide always shows its highlight ("30%") on the right, as
      // it always has — the offer's own banner_image_url is its backdrop.
      right_content_type: "highlight",
      right_image_url: "",
      enabled: true,
    };
  }, [activeOffer]);

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
  // Highlight precedence: this banner's own watermark, then the product count.
  // Trim first — a whitespace-only watermark is "unset", not a blank highlight.
  const highlight = rightImage ? "" : current.watermark_text.trim() || String(count);

  // The offer slide already carries the offer's own copy, so every slide simply
  // renders its own fields.
  const { heading, subtext, cta_text: ctaText, cta_link: ctaLink } = current;

  // An active offer's banner image backs the offer slide only, behind a blush
  // scrim so the heading keeps its contrast. Other slides stay flat blush.
  const isOfferSlide = offerSlide !== null && current === offerSlide;
  const bannerImage = isOfferSlide ? activeOffer?.banner_image_url?.trim() : "";

  return (
    <section
      className="relative w-full overflow-hidden bg-[#F9EEEA] px-8 py-16"
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
          or the banner's own image. Stays desktop-only (md:block) exactly as
          the watermark always has, so the mobile layout is unchanged and the
          absolutely-positioned content can never overlap the left copy. */}
      <div className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 select-none md:block">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            {rightImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={rightImage}
                alt=""
                aria-hidden
                className="h-[200px] w-[26vw] max-w-[300px] object-contain object-right lg:h-[240px]"
              />
            ) : (
              <span className="block font-display text-[200px] font-black tracking-tight leading-none text-[#7A2E4D]/50">
                {highlight}
              </span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Rotating content — cross-fades between banners. Fixed min-height so
          the banner keeps the same height as the old hero (no layout jump). */}
      <div className="relative min-h-[210px] max-w-2xl md:min-h-[240px]">
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
