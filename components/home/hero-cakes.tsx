"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import {
  HeroCake,
  HERO_CAKE_SIZES,
  HERO_CROSSING_MS,
  useHeroTier,
  type HeroMotionMode,
} from "@/components/home/hero-cake";
import { HeroCta } from "@/components/home/hero-cta";
import { PLACEMENT } from "@/components/home/hero-placement";
import { useHeroCarousel } from "@/lib/use-hero-carousel";
import { useHeroAutoplay } from "@/lib/use-hero-autoplay";
import { useHeroImagePreload } from "@/lib/use-hero-image-preload";
import { wrapIndex } from "@/lib/hero-carousel";
import type { HeroSlide } from "@/lib/hero-slider";

// ============================================================
// Le Rasa Bakery — home hero, THE CAKE STAGE
// ------------------------------------------------------------
// The hero's only client component, and the only place anything in the hero
// moves. It owns the drag surface and the three slots; it owns no geometry
// (hero-cake.tsx), no rotation maths (lib/hero-carousel.ts) and no clock
// (lib/use-hero-autoplay.ts). What is left here is the wiring:
//
//   lib/hero-carousel.ts        which image is in which slot     (pure)
//   lib/use-hero-carousel.ts    the position, next / prev        (state)
//   lib/use-hero-autoplay.ts    when to step, and when not to    (clock)
//   lib/use-hero-image-preload  the one image fetched ahead      (effect)
//   components/home/hero-cake   one photo, its slot, its motion  (render)
//   components/home/hero-cta    Order Now, pointed at the centre (render)
//   THIS FILE                   the stage, and every input to it
//
// IT RENDERS THE CTA TOO, and only because of where the state is. Order Now
// opens the product linked to the cake in the CENTRE, so its href changes on
// every step — it has to live under the component holding the position. It is
// a sibling of the drag track in exactly the place home-slider.tsx used to put
// it, at the same z-index, so the composition is unchanged; only which file
// mounts it moved.
//
// EXACTLY THREE CAKES, WHATEVER THE ADMIN UPLOADS. The stage list is three
// entries at most, so three <Image> nodes are mounted and no others exist —
// twenty-five uploaded images render the same three nodes as three do. During
// a transition a FOURTH is briefly held by AnimatePresence: the cake that has
// just left, still fading off the near edge. It is unmounted the moment its
// exit finishes, and it is the price of a cake leaving rather than vanishing.
//
// Each cake is keyed by its POSITION on the ring rather than by its image, so
// a step retires one key and introduces one while the other two survive and
// glide inward — see heroStep for why keying by image breaks at exactly three.
// ============================================================

/** How long a cake holds the centre before the window steps on. */
const ROTATE_MS = 5000;

/** After the pointer leaves the hero: long enough not to pounce, short enough
 *  that the visitor sees it resume rather than wonder if it's broken. */
const HOVER_RESUME_MS = 900;

/** After a deliberate step (arrow key, swipe, click) — someone who has just
 *  chosen a cake is looking at it, so it gets longer than a normal turn. */
const INTERACTION_RESUME_MS = 8000;

/** How far a drag has to travel — or how fast it has to be thrown — before it
 *  counts as a swipe rather than a wobble. The distance threshold scales with
 *  the stage but never drops below a thumb's worth of movement. */
const SWIPE_FRACTION = 0.08;
const SWIPE_MIN_PX = 48;
const SWIPE_VELOCITY = 450;

/** THE AUTOPLAY / TRANSITION INVARIANT, asserted here rather than enforced with
 *  a lock.
 *
 *  An autoplay tick can never land inside a crossing, and it does not need an
 *  `isAnimating` flag to be prevented from doing so: the clock is a TIMEOUT
 *  keyed on `position` (lib/use-hero-autoplay.ts), so it is re-armed at the
 *  moment a step BEGINS and cannot fire again for a full ROTATE_MS. With the
 *  crossing at 0.8s and the interval at 5s, every step has 4.2s of stillness
 *  after it before the next tick is even scheduled to arrive.
 *
 *  A lock would therefore only ever affect MANUAL input — arrow keys and
 *  swipes, which a visitor can fire faster than 0.8s — and there it would be
 *  the wrong answer: dropping someone's second keypress because the first is
 *  still easing reads as an unresponsive carousel. Framer re-targets a running
 *  animation from its current value instead, so a fast second step continues
 *  from wherever the cakes actually are rather than restarting.
 *
 *  This is a real constraint, so it is checked rather than trusted: if the
 *  timings are ever edited into overlapping, this says so in development
 *  instead of leaving a silent double-step to be found on a phone. The crossing
 *  length is imported, never restated — a second copy of 0.9 here would be a
 *  check that agrees with itself instead of with the animation. */
if (process.env.NODE_ENV !== "production" && HERO_CROSSING_MS >= ROTATE_MS) {
  console.warn(
    `[hero] autoplay interval (${ROTATE_MS}ms) is not longer than the crossing ` +
      `(${HERO_CROSSING_MS}ms): ticks can now overlap a transition.`,
  );
}

/** A DEVELOPMENT-ONLY escape hatch for prefers-reduced-motion, and the only
 *  way to see the full crossing on a machine that has the OS setting on.
 *
 *  `?motion=full` forces the crossing, `?motion=reduced` forces the dissolve;
 *  anything else, and every production build, defers to the OS entirely. It is
 *  compiled out of production rather than merely ignored there — the hero's
 *  motion must not be something a URL can dictate for a real visitor, and an
 *  accessibility preference least of all.
 *
 *  Read from `window.location` in an effect rather than through `useSearchParams`
 *  so it stays a local debug affordance with no routing coupling: nothing about
 *  the hero has to become a Suspense boundary or opt into dynamic rendering to
 *  support a flag that does not exist in the deployed build. Reading it in an
 *  effect also keeps the first client render identical to the server's, so the
 *  flag cannot cause a hydration mismatch. */
type HeroMotionOverride = "full" | "reduced" | null;

function useHeroMotionOverride(): HeroMotionOverride {
  const [override, setOverride] = useState<HeroMotionOverride>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const value = new URLSearchParams(window.location.search).get("motion");
    if (value === "full" || value === "reduced") setOverride(value);
  }, []);
  return override;
}

/**
 * @param slides Every visible Hero Slider image, in the admin's order, already
 *   filtered to URLs next/image can render and each carrying the product it
 *   advertises (heroSlidesFrom in lib/hero-slider.ts). The whole list is passed
 *   — the window decides which three are on stage, so there is nothing to
 *   truncate upstream.
 */
export function HeroCakes({ slides }: { slides: HeroSlide[] }) {
  const count = slides.length;
  const { position, slots, stage, next, prev, rotates } = useHeroCarousel(count);

  // MOTION IS A PREFERENCE, NOT A DEFAULT. With prefers-reduced-motion set,
  // each cake arrives in its slot without travelling there, and the continuous
  // float is off entirely — a permanent ambient drift is exactly the kind of
  // motion the setting exists to stop, and unlike the rotation there is no
  // content behind it that would become unreachable.
  //
  // IT DOES NOT STOP THE CLOCK, and that is a deliberate correction. This flag
  // used to gate autoplay as well, which meant the hero never advanced at all
  // on any machine with the OS setting on — the carousel looked broken rather
  // than considerate, and every image after the third was unreachable without
  // a deliberate swipe. The preference is about MOVEMENT, so it is applied to
  // movement: the cakes still change every five seconds, they simply don't
  // travel while doing it.
  //
  // NOR DOES IT STOP THE STEP FROM BEING VISIBLE, which is the correction this
  // change makes. The preference used to be routed onto the same zero-duration
  // path as the CSS→Framer handoff, so a step under it was a single frame in
  // which every cake was somewhere else: a hard cut, which is not what anyone
  // asked for by turning the setting on. It now selects `reduced`, where the
  // geometry still snaps — nothing travels — but opacity tweens, so the change
  // is a dissolve. See THREE MOTION MODES in hero-cake.tsx.
  const reduceMotion = useReducedMotion();
  const motionOverride = useHeroMotionOverride();
  const prefersReduced = motionOverride ? motionOverride === "reduced" : Boolean(reduceMotion);

  const tier = useHeroTier();
  // The first commit that has a tier hands Framer the same numbers the classes
  // already painted, so it must not animate; every commit after it may.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (tier) setSettled(true);
  }, [tier]);

  // WHICH CLOCK A STEP RUNS ON — derived, never stored. It is a pure function of
  // two flags that already exist, so there is no third piece of state to hold in
  // agreement with them and no commit on which it can be stale.
  //
  // `handoff` wins over `reduced`: the handoff frame must be silent whatever the
  // visitor prefers, because the only thing it is hiding is Framer taking over
  // numbers the classes had already painted — there is no change there to
  // dissolve.
  const mode: HeroMotionMode = !settled ? "handoff" : prefersReduced ? "reduced" : "full";

  const trackRef = useRef<HTMLDivElement>(null);

  // ONE image ahead — the next arrival in the right slot, or null when every
  // image is already on stage.
  useHeroImagePreload(slots.preload === null ? null : slides[slots.preload].src, HERO_CAKE_SIZES);

  // The clock also holds itself while the tab is in the background — see the
  // visibility effect in use-hero-autoplay.ts. Nothing here has to arrange it.
  const { hold, release, bump } = useHeroAutoplay({
    // The ONLY reason not to run: too few images for a step to mean anything
    // (under three, the window has nowhere to go — see heroRotates).
    enabled: rotates,
    intervalMs: ROTATE_MS,
    hoverResumeMs: HOVER_RESUME_MS,
    interactionResumeMs: INTERACTION_RESUME_MS,
    restartKey: position,
    onTick: next,
  });

  // --- Gestures ---------------------------------------------
  // The whole track is the drag surface, so the cakes travel with the pointer
  // and spring back against the constraints: the drag reads as resistance
  // rather than as the stage sliding away.
  const onDragStart = useCallback(() => hold("drag"), [hold]);

  const onDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      release("drag");
      if (!rotates) return;
      // Measured off the track at the moment it is needed rather than tracked
      // in state: one read on a gesture that has already ended costs nothing,
      // and it keeps a ResizeObserver out of a component with no other reason
      // to know how wide it is.
      const width = trackRef.current?.clientWidth ?? 0;
      const far = Math.abs(info.offset.x) > Math.max(SWIPE_MIN_PX, width * SWIPE_FRACTION);
      // Velocity as well as distance, so a quick flick counts even though it
      // never travelled far — and a slow wobble never does, however long it
      // went on for.
      const fast = Math.abs(info.velocity.x) > SWIPE_VELOCITY;
      if (!far && !fast) return;
      bump();
      // Dragging left pulls the window left — the same direction the autoplay
      // travels — so the right cake becomes the centre.
      if (info.offset.x < 0) next();
      else prev();
    },
    [rotates, release, bump, next, prev],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      bump();
      if (e.key === "ArrowRight") next();
      else prev();
    },
    [bump, next, prev],
  );

  // Hover pausing is a MOUSE idea. On a touch screen, pointerenter fires on
  // tap and the matching pointerleave often never arrives, which would leave
  // the clock held for the rest of the visit.
  //
  // Both sides name the SAME reason, so the pair is idempotent: an extra enter
  // (a cake unmounting under the cursor as the carousel steps is enough to
  // produce one) adds a hold that is already held, and the single leave that
  // eventually arrives still clears it. Under the old counter that stray enter
  // was a leak, and one leak stopped autoplay permanently.
  const onPointerEnter = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") hold("hover");
    },
    [hold],
  );
  const onPointerLeave = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") release("hover");
    },
    [release],
  );
  // A pointer whose stream is cancelled (the browser taking it over for a
  // native gesture, the page scrolling under a touch) never produces a leave,
  // so the hover hold would outlive it. Clearing it here costs nothing when
  // there was no hold to clear.
  const onPointerCancel = useCallback(() => {
    release("hover");
    release("drag");
  }, [release]);

  // Focus holds the clock for the same reason hover does — but only KEYBOARD
  // focus. Clicking the track focuses it too, and a mouse user who clicks once
  // and moves on would leave the hero holding focus with no blur coming: the
  // carousel would sit paused for the rest of the visit. `:focus-visible` is
  // the browser's own answer to "did they arrive here by keyboard", and the
  // ref keeps hold/release balanced when the answer is no.
  const focusHolding = useRef(false);

  const onFocus = useCallback(
    (e: React.FocusEvent) => {
      if (focusHolding.current) return;
      const target = e.target as Element;
      let keyboard = false;
      try {
        keyboard = target.matches(":focus-visible");
      } catch {
        // Pre-2022 Safari doesn't know the selector and throws on it. Treating
        // that as "not keyboard focus" keeps the pause off rather than risking
        // the trap this whole branch exists to avoid.
      }
      if (!keyboard) return;
      focusHolding.current = true;
      hold("focus");
    },
    [hold],
  );

  const onBlur = useCallback(() => {
    if (!focusHolding.current) return;
    focusHolding.current = false;
    release("focus");
  }, [release]);

  // Where Order Now goes: the product linked to the cake in the CENTRE, or
  // null when that slide has none (unlinked, or a fallback image) — which the
  // CTA turns into the menu. Recomputed on every step, which is the whole
  // reason the button is mounted from here.
  const centreHref = slots.centre === null ? null : slides[slots.centre].href;

  // No images at all: the cakes layer has nothing to draw, but the hero still
  // has a call to action, so the CTA renders on its own. (Returning null here
  // is what used to take Order Now off the page with it.)
  if (count === 0) return <HeroCta href={null} />;

  // THE TRACK — the drag surface, and the cakes' parent — then the CTA beside
  // it, in that DOM order, which is the order home-slider.tsx used to mount
  // them in. The track sits at z-20, under the content plane, so Order Now, the
  // two stat cards and the heading (all z-40) still take their own clicks and
  // text selection.
  return (
    <>
      <motion.div
        ref={trackRef}
        className="absolute inset-0 z-20 cursor-grab touch-pan-y rounded-[24px] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-wine sm:rounded-[32px] lg:rounded-[40px]"
        drag={rotates ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.16}
        dragMomentum={false}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onKeyDown={onKeyDown}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerCancel={onPointerCancel}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={bump}
        // Focusable so the arrow keys have somewhere to land without the hero
        // hijacking Left/Right for the whole page.
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label="Our cakes"
      >
        {/* THE CAKE STAGE — the three slots' shared box, and on mobile the one
            thing between them and the drag track. It carries a single lift
            (PLACEMENT.cakeLift) that raises the whole trio clear of Order Now
            on a phone and is a no-op from `sm` up.

            A PLAIN DIV, on purpose. It is `absolute inset-0` over the same box
            the track covers, so every percentage a cake resolves against is
            unchanged and its transform composes under theirs — the slot glide,
            the tilt, the float and the drag all still run on their own nodes
            and none of them shares a `transform` with this one. */}
        <div className={PLACEMENT.cakeLift}>
          {/* `initial={false}` so the cakes present at first paint don't animate
              in — they are already where they belong. Cakes that mount later do. */}
          <AnimatePresence initial={false}>
            {stage.map(({ key, index, slot }) => (
              <HeroCake
                key={key}
                slot={slot}
                src={slides[index].src}
                tier={tier}
                mode={mode}
                float={!prefersReduced}
                // WHICH OF THE THREE FLOAT OFFSETS THIS CAKE DRIFTS ON, from the
                // same number that is its React key — its position on the ring,
                // folded to 0 · 1 · 2. Two properties fall out of that for free:
                // the phase is FIXED for the cake's whole life (a slot-derived
                // one would change under it on every rotation and restart the
                // drift), and adjacent cakes can never share one, because
                // adjacent positions differ by exactly 1. The opening frame is
                // positions 0 · 1 · 2, so the hero starts on 0s · 0.8s · 1.6s
                // left to right.
                phase={wrapIndex(key, 3)}
                // The centre cake is the hero's LCP, in this frame and every one
                // after it.
                priority={slot === "centre"}
              />
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      <HeroCta href={centreHref} />
    </>
  );
}
