"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { CardStack, type CardStackItem } from "@/components/ui/card-stack";

type Review = CardStackItem & {
  quote: string;
  customer: string;
  orderType: string;
  // Per-review star rating (Google reviews). Local fallback reviews omit it
  // and render the original all-5-stars look.
  rating?: number;
  // Reviewer's Google profile photo. Local fallback reviews omit it, so their
  // card renders exactly as it did before.
  avatar?: string;
};

// Shape passed from the server (lib/google-reviews → StorefrontReviews). Kept
// as a local type so this client component never imports the server-only lib.
type GoogleReviewsData = {
  rating: number;
  total: number;
  reviews: {
    author_name: string;
    profile_photo_url: string;
    rating: number;
    text: string;
    relative_time: string;
  }[];
  placeUrl: string;
};

// Built-in local reviews — the fallback whenever Google Reviews are off or
// unavailable, so the section is never empty. (Unchanged from before.)
const reviews: Review[] = [
  {
    id: 1,
    title: "Sarah M.",
    customer: "Sarah M.",
    orderType: "Birthday Cake",
    quote:
      "Honestly the best eggless cake I've ever had — my daughter's birthday was made complete. So moist you'd never guess it was eggless, and it arrived in Leeds perfectly packaged.",
  },
  {
    id: 2,
    title: "Priya & Raj",
    customer: "Priya & Raj",
    orderType: "Anniversary Cake",
    quote:
      "We ordered a custom anniversary cake and it was stunning. The team in Birmingham captured exactly what we wanted, and every guest asked where it was from. Pure indulgence.",
  },
  {
    id: 3,
    title: "Hannah L.",
    customer: "Hannah L.",
    orderType: "Custom Order",
    quote:
      "I have an egg allergy and finding a proper celebration cake has always been a nightmare — until now. The custom design was flawless and tasted incredible. Delivered to London on time.",
  },
  {
    id: 4,
    title: "James T.",
    customer: "James T.",
    orderType: "Gift Box",
    quote:
      "Sent a gift box to my mum in Manchester for Mother's Day and she hasn't stopped talking about it. Beautifully boxed, fresh, and the little handwritten note was such a lovely touch.",
  },
  {
    id: 5,
    title: "Aisha K.",
    customer: "Aisha K.",
    orderType: "Baby Shower Cake",
    quote:
      "Ordered an eggless cake for my baby shower and it exceeded every expectation. Soft, rich and gorgeous to look at. The whole ordering process was effortless. Will be back for sure!",
  },
];

function useCardSize() {
  const [size, setSize] = React.useState({ width: 480, height: 280 });

  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () =>
      setSize(mq.matches ? { width: 480, height: 280 } : { width: 300, height: 320 });
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return size;
}

/** Five star icons with the first `filled` filled — identical markup to the
 *  original all-5 row (filled === 5 reproduces the previous look exactly). */
function Stars({ filled }: { filled: number }) {
  const n = Math.max(0, Math.min(5, Math.round(filled)));
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }).map((_, i) =>
        i < n ? (
          <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
        ) : (
          <Star key={i} className="h-5 w-5 fill-transparent text-amber-400/30" />
        ),
      )}
    </div>
  );
}

/** Reviewer's Google profile photo. Renders nothing when there's no URL (the
 *  local fallback reviews) or when the image 404s, so the card silently keeps
 *  its original look rather than showing a broken image. */
function Avatar({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = React.useState(false);
  if (!src || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      // Google's lh3.googleusercontent.com CDN rejects requests that carry a
      // referrer, so the photo would 403 without this.
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-full object-cover"
    />
  );
}

function ReviewCard({ review, active }: { review: Review; active: boolean }) {
  return (
    <div
      className="flex h-full w-full flex-col justify-between rounded-3xl bg-white p-8"
      style={{
        border: active ? "2px solid #873853" : "2px solid rgba(213, 164, 164, 0.3)",
      }}
    >
      {/* Photo sits at the top-left, beside the existing stars row. With no
          photo this wrapper collapses to just <Stars/>, which is what the
          local fallback rendered before — so that view is unchanged. */}
      <div className="flex items-center gap-3">
        {review.avatar ? <Avatar src={review.avatar} name={review.customer} /> : null}
        <Stars filled={review.rating ?? 5} />
      </div>

      <blockquote
        className="mt-5 line-clamp-3 flex-1 text-base italic leading-relaxed"
        style={{ color: "#612437" }}
      >
        “{review.quote}”
      </blockquote>

      <figcaption className="mt-6 text-sm font-bold" style={{ color: "#873853" }}>
        — {review.customer}, {review.orderType}
      </figcaption>
    </div>
  );
}

export function Testimonials({ google }: { google?: GoogleReviewsData | null }) {
  const { width, height } = useCardSize();

  // Use live Google reviews when available; otherwise fall back to the local
  // set so the carousel is never empty. Only the DATA changes — the carousel,
  // card design, animations, spacing and layout are all unchanged.
  //
  // Every review Google returns is mapped and handed to the carousel; nothing
  // is sliced or capped here, so however many arrive is however many cycle.
  const useGoogle = Boolean(google && google.reviews.length > 0);
  const displayReviews: Review[] = useGoogle
    ? google!.reviews.map((r, i) => ({
        id: `g-${i}`,
        title: r.author_name,
        customer: r.author_name,
        // The card's second caption slot carries the relative time for Google
        // reviews (e.g. "2 weeks ago"), keeping the exact same markup.
        orderType: r.relative_time || "Google review",
        quote: r.text,
        rating: r.rating,
        avatar: r.profile_photo_url,
      }))
    : reviews;

  return (
    <section className="section-padding relative overflow-hidden" style={{ backgroundColor: "#F9EEEA" }}>
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-dustyrose/20 blur-3xl" />
      <div className="container relative">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-dustyrose-light/70 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-wine-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-wine" />
            Sweet Words
          </span>
          <h2 className="font-display text-3xl font-semibold leading-tight text-darkberry text-balance sm:text-4xl md:text-5xl">
            Loved by Our Customers
          </h2>
          {/* Google rating header — only when live Google data is present. The
              mt-4 matches the spacing the removed counter line used to carry,
              so the gap under the heading is unchanged. */}
          {useGoogle && google!.rating > 0 && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                <span className="font-display text-2xl font-bold text-darkberry">
                  {google!.rating.toFixed(1)}
                </span>
                <Stars filled={google!.rating} />
              </div>
              <p className="text-sm font-semibold text-wine-dark">
                {google!.total} Google Reviews
              </p>
            </div>
          )}
        </motion.div>

        <div className="mt-12 md:mt-16">
          <CardStack<Review>
            items={displayReviews}
            renderCard={(item, { active }) => (
              <ReviewCard review={item} active={active} />
            )}
            autoAdvance={true}
            intervalMs={3000}
            pauseOnHover={true}
            cardWidth={width}
            cardHeight={height}
            showDots
          />
        </div>

        {/* Leave a Google Review — only in Google mode. */}
        {useGoogle && google!.placeUrl && (
          <div className="mt-8 flex justify-center">
            <a
              href={google!.placeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-wine px-6 py-3 text-sm font-bold text-blush-50 shadow-clay-sm transition-transform hover:-translate-y-0.5"
            >
              <Star className="h-4 w-4 fill-current" />
              Leave a Google Review
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
