"use client";

// ============================================================
// Le Rasa Bakery — ONE CAKE (the hero's image renderer)
// ------------------------------------------------------------
// A single photo, and the only animated thing in the hero. It holds no
// carousel state and cannot move itself: the engine says which slot it is in,
// and it glides to that slot. Nothing else in the composition — background,
// heading, divider, Order Now, the stat cards — has a motion component
// anywhere near it.
//
// THE COVER FLOW
//
//   offLeft        left          CENTRE          right        offRight
//   (hidden)      (small)        (large)        (small)       (hidden)
//      ◀── ─────────── ◀── ─────────── ◀── ─────────── ◀── ───────────
//
// A cake enters off-stage on the side it arrives from, crosses through the
// side slot into the centre — growing, coming forward, at full opacity — and
// leaves the same way on the other side. Only three cakes are mounted at rest,
// so the ones off-stage exist for the length of a transition and no longer:
// the entering cake mounts at offRight, and the leaving one is held at offLeft
// by AnimatePresence just long enough to fade.
//
// GEOMETRY: PERCENTAGES, NOT PIXELS
//
// Every position is a percentage of the cake's OWN width, which is what lets
// one set of numbers serve all three breakpoints without measuring anything:
// the box sizes itself in CSS (w-[44%] → sm:42% → lg:36% of the stage) and the
// transform scales with it. The three tiers below differ only in how far apart
// the slots sit — `step` shrinks as the stage narrows, because the chunkier
// mobile cake at a desktop spacing would ride off the edge.
//
// FIRST PAINT IS CSS, THEN FRAMER TAKES OVER
//
// The server cannot know the viewport, so the HTML it sends positions cakes
// with Tailwind classes (SLOT_CLASS) and passes no motion target at all. Once
// mounted, the tier is known and Framer writes an inline transform holding the
// SAME numbers — applied with a zero-duration transition on that first commit,
// so there is nothing to see at the handoff. No flash, no shift, no reflow.
//
// FIVE NESTED BOXES, ONE PROPERTY EACH
//
// A cake is five elements deep, and that is not decoration: each one owns a
// DIFFERENT transform (or filter), and stacking them is the only way several
// continuous animations can run on one cake without overwriting each other. One
// element has one `transform`, so a float and a slot glide on the same node
// would be a single string that both animations fight over.
//
//   1  SLOT     x · y · scale · opacity   the crossing         (the engine)
//   2  HOVER    scale 1.02                pointer, desktop     (a gesture)
//        ├ (OUTSIDE the tilt and the float) the contact shadow
//        └ 3  TILT   rotateY ±4°          the turn off-axis    (a pose)
//             └ 4  FLOAT  y ±10px, 5.6s   the drift            (a loop)
//                  └ 5  LENS  blur 0→3px  depth of field       (a filter)
//                       └ the photo, carrying its drop shadows
//
// The contact shadow is deliberately NOT inside the float box: a shadow cast on
// a surface does not rise with the thing casting it. It stays put and answers
// the float by breathing — see THE PARALLAX below. It is outside the TILT box
// for the same reason: the ground does not turn when the cake on it does.
//
// THE LENS IS AT THE BOTTOM, under every transform rather than over them, and
// that is a performance decision rather than a compositional one — a filter
// re-runs whenever its subtree repaints, so a blur above the float would be
// recomputed on every frame of a drift that never ends. See THE PHOTO.
//
// DEPTH OF FIELD
//
// A real lens focused on the centre cake cannot hold the other two sharp, and
// that single fact is what stops the trio reading as three PNGs pasted at three
// sizes. The centre is always at 0px — never blurred, in any frame, at any
// breakpoint — and the sides carry a couple of pixels of Gaussian blur that
// tweens to nothing as they arrive.
//
// THE NUMBER IS NOT QUITE WHAT LANDS ON SCREEN. A `filter` is applied in the
// element's OWN coordinate space and the slot transform then scales the result,
// so the 0.75 side scale shrinks the blur with everything else: the declared
// 3px paints as ~2.25px. That is close enough to the design figure to declare it
// literally rather than pre-divide it, which is what the old three-tier table
// did back when the side scale was 0.52 and the shortfall was nearly half.
//
// DEPTH WITHOUT TOUCHING THE PNG
//
// The uploads are transparent cutouts with no shading of their own, so they
// read as stickers. Two CSS layers fix that and neither one draws a shape:
//
//   DROP SHADOW    `filter: drop-shadow()` on the photo. It is cast from the
//                  image's own ALPHA, so it traces the cake's real silhouette —
//                  the tiers, the drips, the stand — not its bounding box. THREE
//                  passes, near enough to how a soft-boxed studio light falls
//                  off: one very wide and faint for the ambient bloom, one
//                  medium and darker for the body of the shadow, one tight and
//                  darkest for the edge that makes it look solid.
//   CONTACT SHADOW A soft ellipse on the surface under the stand. This is what
//                  actually plants the cake; a drop shadow alone leaves it
//                  hovering. A radial gradient that fades to nothing at the
//                  rim, so it has no edge to give itself away.
//
// Both are cast in the hero's own shadow colour (rgba(116,50,73,…), the same
// darkberry the section and the CTA already cast in), never in black — a grey
// shadow on a warm pink plate reads as dirt.
//
// THE PARALLAX
//
// The float and the contact shadow run the same clock — same duration, same
// easing, same delay — with MIRRORED keyframes, so they cannot drift apart:
//
//   cake up   (y −10)  →  shadow small and light   (scale 0.90, opacity 0.62)
//   cake down (y +10)  →  shadow wide and dark     (scale 1.08, opacity 1)
//
// KEYFRAMES ARE MODULE CONSTANTS, and that is load-bearing rather than tidy.
// Framer restarts a keyframe animation when its target array changes identity.
// The stage re-slots every cake every five seconds, so a per-render array would
// restart the float on each rotation — the cake would snap back to the top of
// its arc mid-drift, and the shadow would restart with it. Hoisted, the arrays
// are the same reference on every render and the loop runs undisturbed for the
// cake's whole life. Nothing that varies by SLOT may enter them: the side
// cakes' fainter shadow is a static class on the wrapper, not a keyframe.
//
// EVERYTHING A ROTATION TOUCHES MOVES AT ONCE, ON ONE CURVE — x, y, scale,
// opacity, rotateY, blur and the contact shadow's strength all leave for their
// new values on the same frame and land on the same frame, 0.8s later, under a
// single ease-out-cubic (see CROSSING). There is no second clock for the blur
// and no third for opacity: the curve never overshoots, so neither one needs an
// exception, and a step has one beginning and one end rather than three
// properties finishing whenever their own maths ran out.
//
// The one property that does NOT interpolate is z-index — see SLOT_DEPTH. That
// is not an oversight to be corrected: z-index has no meaningful in-between,
// and tweening it puts the outgoing cake in front of the incoming one for a
// handful of frames in the middle of the crossing.
//
// THREE MOTION MODES, NOT A BOOLEAN
//
// `mode` decides which clock a step runs on, and it exists because the boolean
// it replaces folded two unrelated things into one 0s path:
//
//   handoff   0s. The first commit after the tier is known, where the motion
//             target already matches what the classes painted. Nothing to see,
//             and nothing that MAY be seen — this is the frame the whole
//             CSS→Framer handoff is built to hide.
//   reduced   prefers-reduced-motion. Geometry snaps — no travel, no growth,
//             no blur ramp, no turn — but OPACITY still tweens, so a step reads
//             as a cross dissolve instead of a jump cut. The preference is
//             about MOVEMENT; it is not a request to be shown hard cuts.
//   full      the 0.8s crossing described above.
//
// The old boolean sent `reduced` down the same 0s path as `handoff`, which is
// why the hero hard-swapped its cakes on any machine with the OS setting on:
// every property in the table above changed between two consecutive frames.
// ============================================================

import { memo, useEffect, useState } from "react";
import Image from "next/image";
import { motion, type Transition } from "framer-motion";
import type { HeroSlot } from "@/lib/hero-carousel";

/** Tailwind's own breakpoints, so the tier used for motion and the classes
 *  used for the pre-hydration paint can never disagree. */
export type HeroTier = "base" | "sm" | "lg";

/** Which clock a step runs on. See THREE MOTION MODES in the header — the
 *  three values are not degrees of the same thing, they are three different
 *  answers to "may this cake move, and may it fade". */
export type HeroMotionMode = "handoff" | "reduced" | "full";

/** The two off-stage parking places, which are slots for animation purposes
 *  but never for the engine — no cake is ever *assigned* one. */
type OffStage = "offLeft" | "offRight";

type CakeTarget = { x: string; y: string; scale: number; opacity: number };

/**
 * How wide a cake actually paints, so the browser can pick the smallest srcset
 * candidate that still covers it. Solved from the real composition rather than
 * estimated: the stage is the section minus its margin (mx-3 / sm:mx-4 /
 * lg:mx-6), capped at 1280px, and the centre cake is 36–44% of that:
 *
 *   ≥1328px  stage caps at 1280 → 0.36 × 1280 = 461px
 *   ≥1024px  0.36 × (100vw − 48px) ≈ 36vw
 *   ≥640px   0.42 × (100vw − 32px) ≈ 42vw
 *   <640px   0.44 × (100vw − 24px) ≈ 44vw
 *
 * First match wins, so these run widest-first. Exported because the preloader
 * has to ask for the SAME candidate the <Image> will later request — a preload
 * at a different width is a second download, not a head start.
 */
export const HERO_CAKE_SIZES =
  "(min-width: 1328px) 461px, (min-width: 1024px) 36vw, (min-width: 640px) 42vw, 44vw";

/** A cake's box: size and anchor only. Every position is a transform on top of
 *  this, so all the cakes stay locked to one another at any viewport. */
const CAKE_BOX =
  "absolute left-1/2 top-[71%] aspect-square w-[44%] sm:top-[65%] sm:w-[42%] lg:top-[66%] lg:w-[36%]";

/** Both side cakes ride slightly high and a quarter smaller — that shallow arc
 *  is what makes the trio read as a display rather than a row — and sit well
 *  back from full opacity, which is what now carries most of the "behind".
 *
 *  These are the SIDE_* constants written as classes for the pre-hydration
 *  paint. The two tables must agree exactly or the CSS→Framer handoff shows. */
const SIDE_CLASS = "-translate-y-[58%] scale-[0.75] opacity-[0.55]";

/** The pre-hydration paint: the same three positions as CAKE_X, written as
 *  classes so the server's HTML is already correct at every breakpoint.
 *  `left-1/2` puts the box's LEFT edge on the centre line, so every slot
 *  carries the −50% that centres it and adds its step on top. */
const SLOT_CLASS: Record<HeroSlot, string> = {
  left: `-translate-x-[122%] sm:-translate-x-[125%] lg:-translate-x-[150%] ${SIDE_CLASS}`,
  centre: "-translate-x-1/2 -translate-y-1/2",
  right: `translate-x-[22%] sm:translate-x-[25%] lg:translate-x-[50%] ${SIDE_CLASS}`,
};

/** Horizontal position per tier, as a percentage of the cake's own width.
 *  These are the SLOT_CLASS numbers — the handoff from CSS to Framer is only
 *  invisible because the two tables agree exactly. */
const CAKE_X: Record<HeroTier, Record<HeroSlot | OffStage, string>> = {
  base: { offLeft: "-194%", left: "-122%", centre: "-50%", right: "22%", offRight: "94%" },
  sm: { offLeft: "-200%", left: "-125%", centre: "-50%", right: "25%", offRight: "100%" },
  lg: { offLeft: "-250%", left: "-150%", centre: "-50%", right: "50%", offRight: "150%" },
};

/** A side cake's size relative to the centre one, the lift that puts it on the
 *  arc, and how far back it sits. Constant across tiers — only the spacing
 *  changes.
 *
 *  SIDE_SCALE IS ALSO THE COMPOSITION, not only a depth cue. The three cakes
 *  are spaced by CAKE_X, which is untouched, so raising the scale moves the
 *  side cakes' EDGES outward and inward without moving their centres — they
 *  reach further towards the stage rim and further across the centre cake. At
 *  0.75 the clearances are:
 *
 *    lg    side cake's outer edge sits ~0.5% of the stage width inside the rim
 *          (it was ~4.6% at 0.52) — tight, but not clipped
 *    base  side and centre boxes overlap by ~6.8% of the stage width
 *          (it was ~1.8%) — the transparent margins absorb most of it
 *
 *  DEPTH IS NOW CARRIED BY BLUR AND OPACITY RATHER THAN BY SIZE, which is the
 *  point of the larger figure: a side cake that is nearly as big as the centre
 *  one but noticeably softer and fainter reads as *behind* rather than as
 *  *smaller*, and that is the difference between a showcase and a row of
 *  thumbnails. If the side cakes ever need to grow again, CAKE_X has to be
 *  re-solved with them — the two tables are one composition. */
const SIDE_Y = "-58%";
const SIDE_SCALE = 0.75;
const SIDE_OPACITY = 0.55;

/** THE DEPTH OF FIELD. 3px declared, which paints as ~2.25px once the slot's
 *  0.75 scale has shrunk it (see DEPTH OF FIELD in the header). Enough to hold
 *  the side cakes back from the centre without dissolving what they are: at the
 *  earlier 6px the previews softened past the point where a visitor could tell
 *  one cake from the next, which costs the carousel the thing it is advertising.
 *
 *  ONE FIGURE FOR EVERY TIER, where this used to ramp 3.8 / 5 / 6.2 across a
 *  Record<HeroTier, number>. The ramp existed to compensate for the old 0.52
 *  scale eating a different share of the radius at each breakpoint; with the
 *  scale raised and the geometry proportional at every tier, one declared radius
 *  lands at the same visual weight everywhere — which is what "identical on
 *  desktop, laptop, tablet and mobile" requires. Three identical entries in a
 *  table would only be the same magic number written three times, so it is a
 *  scalar; a tier that ever needs its own figure can have the table back.
 *
 *  SIDE_BLUR_CLASS BELOW MUST CARRY THE SAME NUMBER. It cannot be interpolated
 *  from this one — Tailwind's extractor only sees literal class strings — so the
 *  two are checked against each other in development instead (see below).
 *
 *  THE CENTRE NEVER READS THIS. It is 0px, always — blurFor returns it directly,
 *  so there is no tier, no breakpoint and no frame of a transition in which the
 *  cake the visitor is looking at is anything but sharp. */
const SIDE_BLUR_PX = 3;

/** The same numbers as classes, for the pre-hydration paint — the blur has to be
 *  right in the server's HTML for the same reason the positions do.
 *
 *  `will-change: filter` travels WITH the blur rather than being declared once
 *  on the element, so it lands on exactly the cakes that have a filter and never
 *  on the centre. That is deliberate: a promoted layer is rasterised at the size
 *  the compositor chose for it, and the centre cake is the one thing in the hero
 *  that must be pixel-sharp at its true size in every frame. The blank centre
 *  entry is the whole depth-of-field rule written as a value — there is no
 *  string here that could put a filter on the cake being looked at. */
const SIDE_BLUR_CLASS = "blur-[3px] will-change-[filter]";

/** The one thing keeping the pre-hydration class and the animated value in step.
 *  They are the same radius written twice — once for Tailwind, which needs a
 *  literal, and once for Framer, which needs a number — and if they ever drift
 *  apart the side cakes visibly re-focus on the handoff commit, which is the one
 *  frame the whole CSS→Framer dance exists to make invisible. Dev only; the
 *  comparison is constant-folded out of production. */
if (process.env.NODE_ENV !== "production" && !SIDE_BLUR_CLASS.includes(`blur-[${SIDE_BLUR_PX}px]`)) {
  console.warn(
    `[hero] side blur mismatch: SIDE_BLUR_PX is ${SIDE_BLUR_PX}px but ` +
      `SIDE_BLUR_CLASS is "${SIDE_BLUR_CLASS}" — the handoff will visibly re-focus.`,
  );
}

const SLOT_BLUR_CLASS: Record<HeroSlot, string> = {
  left: SIDE_BLUR_CLASS,
  centre: "",
  right: SIDE_BLUR_CLASS,
};

/** THE TURN. A side cake is not just smaller, it is angled — its face turned
 *  back towards the centre, the way the sleeves either side of the front one
 *  are in Cover Flow. Positive rotateY points a face to the RIGHT, so the LEFT
 *  cake takes the positive angle and the right cake the negative one: both look
 *  inward, at the cake the visitor is actually reading.
 *
 *  4° is deliberately at the shallow end of the range. These are photographs of
 *  real objects shot straight on, so a steep rotation reads as a skewed image
 *  rather than as a turned cake; at this angle what the eye picks up is the near
 *  edge coming forward, which is all it is for. */
const TILT_PERSPECTIVE = 1200;
const SIDE_ROTATE_Y = 4;

/** The pre-hydration paint for the turn. One arbitrary `transform` rather than
 *  utilities, because Tailwind 3 has no rotate-Y and the perspective has to sit
 *  in the same string to apply to it. */
const SLOT_TILT_CLASS: Record<HeroSlot, string> = {
  left: "[transform:perspective(1200px)_rotateY(4deg)]",
  centre: "",
  right: "[transform:perspective(1200px)_rotateY(-4deg)]",
};

/** Stacking. Not animated: handed to Framer it would be tweened, and a
 *  fractional z-index during the crossing lets the outgoing centre cake sit in
 *  front of the incoming one for a few frames. As a plain style it flips the
 *  instant the window steps, so the cake growing into the centre comes forward
 *  exactly when it starts to grow. */
const SLOT_DEPTH: Record<HeroSlot | OffStage, number> = {
  offLeft: 10,
  left: 20,
  centre: 30,
  right: 20,
  offRight: 10,
};

/** THE CROSSING — ONE CURVE, ONE DURATION, EVERY PROPERTY.
 *
 *  This replaces the over-damped spring the cakes used to settle on. A spring
 *  is defined by its physics rather than by its length, so each property
 *  arrived when its own maths said so and the transition had no single end: the
 *  blur had to run on a separate, shorter tween to keep the spring's long
 *  converging tail from re-rasterising the layer for far longer than the move
 *  actually took, and opacity needed a third transition of its own because a
 *  spring can overshoot past 1 and clip. Three clocks for one movement.
 *
 *  A fixed tween collapses all three into this one. x, y, scale, opacity,
 *  rotateY, the depth-of-field blur and the contact shadow's strength now start
 *  on the same frame AND land on the same frame, which is what makes the step
 *  read as one object crossing the stage rather than as several properties
 *  agreeing to move at once.
 *
 *  0.8s against a 5s cadence, which leaves a 4.2s hold — long enough for the
 *  centre cake to be read as a still photograph rather than as a frame of an
 *  animation, short enough that the hero is never mistaken for static.
 *
 *  THE CURVE is cubic-bezier(0.22, 0.61, 0.36, 1) — ease-out-cubic. It leaves
 *  promptly, covers most of the distance early, and spends the tail easing to a
 *  stop, which is the shape the eye reads as mass. It is a gentler departure
 *  than the ease-out-quint it replaces: quint dumps so much of the travel into
 *  the first third that a step reads as a snap followed by a long settle, and at
 *  the larger 0.75 side scale there is more cake in motion for that to show on.
 *
 *  IT IS MONOTONIC AND BOUNDED BY 1, so it approaches its target from below and
 *  NEVER overshoots. That is not decoration: it is what lets opacity ride the
 *  same curve as everything else without clipping past 1, and what makes the
 *  blur's cost bounded — the radius is provably done changing at 0.8s, so the
 *  expensive re-raster window has a hard end. Any replacement curve must keep
 *  both control points' y within [0, 1] or those two guarantees are gone. */
const CROSSING_EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];
const CROSSING = {
  type: "tween" as const,
  duration: 0.8,
  ease: CROSSING_EASE,
};

/** The crossing in milliseconds, for the one consumer that has to reason about
 *  it in the same units as the autoplay clock (hero-cakes.tsx). Derived, so the
 *  duration is written exactly once. */
export const HERO_CROSSING_MS = CROSSING.duration * 1000;

/** No transition at all: the first commit after the tier is known, where the
 *  target already matches what CSS painted. */
const INSTANT = { duration: 0 } as const;

/** THE REDUCED-MOTION STEP — a cross dissolve, and nothing else.
 *
 *  `default` covers x, y, scale, rotateY and the blur: all of them snap, so a
 *  cake arrives in its new slot without travelling, growing or turning. That is
 *  the whole of what prefers-reduced-motion asks for — an instant reposition is
 *  the standard accommodation for it, a 250%-wide glide is not.
 *
 *  OPACITY IS THE EXCEPTION, deliberately. It is the one property whose change
 *  carries no movement, so tweening it costs the preference nothing and buys
 *  back the only thing the old 0s path threw away: continuity. A cake leaving
 *  fades out, one arriving fades in, and the step has a beginning and an end
 *  rather than being a single frame in which the hero is suddenly different.
 *
 *  0.4s, easeInOut. Short enough that it never reads as motion in its own
 *  right, long enough that the eye follows the change instead of being cut to
 *  the far side of it. */
const DISSOLVE_DURATION = 0.4;
const DISSOLVE = {
  default: INSTANT,
  opacity: { type: "tween" as const, duration: DISSOLVE_DURATION, ease: "easeInOut" as const },
} as const;

/** Which clock a step runs on. One lookup for all three animated boxes (slot,
 *  tilt, lens), so the crossing cannot end up half on one clock and half on
 *  another — the single-clock rule the header sets out is enforced here rather
 *  than repeated at each call site. */
const STEP_TRANSITION: Record<HeroMotionMode, Transition> = {
  handoff: INSTANT,
  reduced: DISSOLVE,
  full: CROSSING,
};

// ---- THE FLOAT ----------------------------------------------

/** How far a cake drifts, in px, at each breakpoint.
 *
 *  Applied on a box the SLOT transform has already scaled, so a side cake at
 *  0.75 drifts ~7.5px against the centre's 10 — which is what a nearer object
 *  moving further looks like, and it comes free rather than being a second
 *  table to keep in step.
 *
 *  Smaller on the narrow tiers: 10px against a 44vw cake on a phone is a much
 *  larger share of the composition than the same 10px against a 461px cake on
 *  a desktop, and at that ratio the drift stops reading as a float and starts
 *  reading as a wobble. */
const FLOAT_Y: Record<HeroTier, number[]> = {
  base: [0, -6, 0, 6, 0],
  sm: [0, -8, 0, 8, 0],
  lg: [0, -10, 0, 10, 0],
};

/** One full round trip: REST → up → rest → down → rest. Slow enough to read as
 *  weight rather than as a bounce; `easeInOut` on each of the four legs is what
 *  holds the cake for a beat at the top and bottom of the arc instead of
 *  turning around on the spot.
 *
 *  IT STARTS AND ENDS AT ZERO, which is not a stylistic choice. Framer snaps a
 *  value to keyframes[0] the instant an animation begins, so a cycle written as
 *  [−10, 10, −10] would jerk the cake 10px upward at hydration — and again, one
 *  cake at a time, as each stagger delay expired. Starting at rest means the
 *  first frame of the drift is exactly where the cake already stood, so the
 *  float opens on nothing at all. It is also what lets the reduced-motion pose
 *  (FLOAT_REST) be the same position rather than an approximation of it. */
const FLOAT_DURATION = 5.6;

/** What separates one cake's drift from its neighbours'. Three cakes at 0.8s
 *  spread them across the first half of the cycle, so no two are ever at the
 *  same point of the arc and the trio never pulses as one block. */
const FLOAT_PHASE_STEP = 0.8;

/** The contact shadow's answer to the float — the same five beats, mirrored, so
 *  the shadow is at its smallest and faintest exactly when the cake is at the
 *  top of its arc and at its widest and darkest at the bottom. Same length as
 *  FLOAT_Y and driven by the same transition, which is what keeps the two
 *  locked together for as long as the page is open. */
const SHADOW_SCALE = [1, 0.9, 1, 1.08, 1];
const SHADOW_OPACITY = [0.82, 0.62, 0.82, 1, 0.82];

/** Where the float and the shadow sit when nothing is animating: reduced
 *  motion, and the pre-hydration paint. Identical to the first keyframe of
 *  each cycle, so starting or stopping the drift is never a visible step. */
const FLOAT_REST = { y: 0, z: 0 } as const;
const SHADOW_REST = { scale: 1, opacity: 0.82 } as const;

/** The float's clock, one per phase — the cake drifts on the offset its ring
 *  position gives it, so it is out of step with both its neighbours and stays
 *  that way for its whole life. (A delay derived from the SLOT would change
 *  under the cake on every rotation and restart the drift each time.)
 *
 *  BUILT ONCE, at module scope, for the same reason the keyframes are: these
 *  three objects are all a cake ever hands Framer, so the transition can never
 *  arrive as a fresh reference and put the running loop in question. Nothing
 *  here varies per render, so there is nothing for a hook to memoise. */
const FLOAT_TRANSITIONS = [0, 1, 2].map((phase) => ({
  duration: FLOAT_DURATION,
  ease: "easeInOut" as const,
  repeat: Infinity,
  delay: phase * FLOAT_PHASE_STEP,
}));

// ---- DEPTH ---------------------------------------------------

/** The hero's shadow colour — darkberry, the same ink the section band and the
 *  Order Now button already cast in. Never black. */
const SHADOW_INK = "116, 50, 73";

/** Cast from the photo's own alpha, so it traces the cake and not its box.
 *
 *  THREE passes, because one shadow is a cutout and three are an object. Real
 *  light off a soft box does not fall off at a single rate, and each pass here
 *  is doing a job the others cannot:
 *
 *    AMBIENT  very wide, very faint, thrown well below the cake — the bloom
 *             that gives the stage a floor to sit on. Alone it looks like fog.
 *    BODY     medium and darker, the shadow proper. Alone it looks stuck on.
 *    EDGE     tight and darkest, hugging the base of the stand. This is the
 *             one the eye reads as weight, and the one that must never spread:
 *             widen it and the cake starts to hover again.
 *
 *  Per tier because these are PIXELS against a cake whose width is a percentage
 *  — one set of offsets would be a smear at 461px and a black outline at 44vw.
 *  The opacities fall as the radii grow, which is the whole trick: three shadows
 *  at one opacity is just a darker shadow. */
const CAKE_DROP_SHADOW: Record<HeroTier, string> = {
  base:
    `drop-shadow(0 18px 26px rgba(${SHADOW_INK}, 0.09)) ` +
    `drop-shadow(0 10px 15px rgba(${SHADOW_INK}, 0.16)) ` +
    `drop-shadow(0 3px 5px rgba(${SHADOW_INK}, 0.10))`,
  sm:
    `drop-shadow(0 26px 38px rgba(${SHADOW_INK}, 0.10)) ` +
    `drop-shadow(0 15px 22px rgba(${SHADOW_INK}, 0.17)) ` +
    `drop-shadow(0 4px 7px rgba(${SHADOW_INK}, 0.10))`,
  lg:
    `drop-shadow(0 38px 54px rgba(${SHADOW_INK}, 0.11)) ` +
    `drop-shadow(0 22px 32px rgba(${SHADOW_INK}, 0.18)) ` +
    `drop-shadow(0 6px 10px rgba(${SHADOW_INK}, 0.11))`,
};

/** The ellipse on the surface under the stand. Sized and placed against the
 *  CAKE BOX, so it scales with the cake at every breakpoint and through the
 *  slot transform without a second set of numbers. */
const CONTACT_SHADOW_BOX =
  "pointer-events-none absolute bottom-[3%] left-1/2 h-[8%] w-[56%] -translate-x-1/2";

/** Solid under the stand, gone by the rim. `closest-side` fits the gradient to
 *  the box's own ellipse, so the falloff stays soft at any cake size — and
 *  there is no `blur()` filter to rasterise every frame. */
const CONTACT_SHADOW_FILL =
  `radial-gradient(closest-side, rgba(${SHADOW_INK}, 0.34) 0%, ` +
  `rgba(${SHADOW_INK}, 0.22) 45%, rgba(${SHADOW_INK}, 0.07) 74%, rgba(${SHADOW_INK}, 0) 100%)`;

/** How strongly a slot's contact shadow reads, plus its hover lift.
 *
 *  A STATIC CLASS, never a keyframe: this is the one part of the shadow that
 *  varies by slot, and folding it into SHADOW_OPACITY would give that array a
 *  new identity on every rotation and restart the parallax out of phase with
 *  the float (see the header). The side cakes are already dimmed a second time
 *  by the 0.75 slot scale shrinking the ellipse — further away, fainter and
 *  smaller, which is the whole point. */
const SHADOW_STRENGTH: Record<HeroSlot, string> = {
  left: "opacity-50 [@media(hover:hover)]:group-hover:opacity-70",
  centre: "opacity-90 [@media(hover:hover)]:group-hover:opacity-100",
  right: "opacity-50 [@media(hover:hover)]:group-hover:opacity-70",
};

/** The contact shadow's strength swap, on the same clock the step is running.
 *  The VALUE stays in SHADOW_STRENGTH's classes so the hover variant still
 *  applies; this is only the timing, written in CSS rather than handed to
 *  Framer for the reason set out where it is used.
 *
 *  ONE ENTRY PER MODE, because the shadow is part of the step and must not be
 *  tuned apart from it: at `full` it shares CROSSING's duration and curve, at
 *  `reduced` it fades over the dissolve instead of spending 0.8s catching up
 *  with geometry that has already snapped. `handoff` shares the full timing —
 *  no slot changes on that commit, so there is nothing for it to transition. */
const SHADOW_STRENGTH_FULL: React.CSSProperties = {
  transitionProperty: "opacity",
  transitionDuration: `${CROSSING.duration}s`,
  transitionTimingFunction: `cubic-bezier(${CROSSING_EASE.join(",")})`,
};
const SHADOW_STRENGTH_TRANSITION: Record<HeroMotionMode, React.CSSProperties> = {
  handoff: SHADOW_STRENGTH_FULL,
  reduced: {
    transitionProperty: "opacity",
    transitionDuration: `${DISSOLVE_DURATION}s`,
    transitionTimingFunction: "ease-in-out",
  },
  full: SHADOW_STRENGTH_FULL,
};

/** WILL-CHANGE IS A PROMISE, NOT A SPEEDUP, and every one of these costs a
 *  compositing layer for as long as it is declared — width × height × 4 bytes of
 *  GPU memory, held whether or not anything is moving. A cake is five boxes
 *  deep and up to four cakes are mounted, so a hint left on unconditionally is
 *  not one layer, it is twenty.
 *
 *  framer-motion 11 does NOT manage will-change on its own (it only follows a
 *  `willChange` MotionValue the caller supplies), so what is declared here is
 *  exactly what the browser gets. The rule applied throughout this file is
 *  therefore: A NODE CARRIES A HINT ONLY WHILE SOMETHING ON IT IS ACTUALLY
 *  ANIMATING.
 *
 *    slot, tilt   transform, but only outside `reduced` — those two nodes are
 *                 where the crossing lives, and in reduced mode the crossing
 *                 does not move them at all. (The opacity that DOES change
 *                 there is cheap and needs no hint; hinting it would create the
 *                 very layer this is avoiding.)
 *    float,       transform / opacity, but only while `drifting`. These two run
 *    contact      forever when they run at all, which is the strongest possible
 *    shadow       case for a hint — and no case whatsoever when the drift is off.
 *    lens         filter, and only on the cakes that HAVE a filter — it rides
 *                 with the blur in SLOT_BLUR_CLASS, so the centre never gets one.
 *    hover box    NONE. It animates on `whileHover`, a mouse-only gesture that
 *                 cannot fire on a touch device at all — so the old
 *                 unconditional hint there held a permanent layer per cake on
 *                 every phone in exchange for nothing.
 *
 *  BACKFACE-VISIBILITY AND PRESERVE-3D ARE DELIBERATELY ABSENT. `backface-
 *  visibility: hidden` only matters past 90° of rotation and the tilt is 4°, so
 *  no backface is ever within sight of being shown; declaring it would force
 *  another layer to solve a problem this composition cannot have.
 *  `transform-style: preserve-3d` would be actively harmful: it stops the tilt
 *  box flattening its subtree, which is exactly the flattening that lets the
 *  browser rasterise the blurred photo once and composite it for free
 *  thereafter (see THE LENS). Neither is added. */
const TRANSFORM_HINT = "will-change-transform";

/** The hover lift: closer, not bigger. 1.02 is under the threshold at which the
 *  cake visibly changes size — what the visitor reads is the drop shadow and
 *  the contact shadow growing with it, i.e. the cake coming forward.
 *
 *  A tween, not the slot spring: a spring here would overshoot and bounce, and
 *  a cake that bobs when the cursor crosses it is a toy. */
const HOVER_TRANSITION = { type: "tween", duration: 0.28, ease: "easeOut" } as const;
const HOVER_SCALE = 1.02;

/** Where a cake stands in a given slot, at a given breakpoint. */
function targetFor(slot: HeroSlot | OffStage, tier: HeroTier): CakeTarget {
  const centred = slot === "centre";
  const off = slot === "offLeft" || slot === "offRight";
  return {
    x: CAKE_X[tier][slot],
    y: centred ? "-50%" : SIDE_Y,
    scale: centred ? 1 : SIDE_SCALE,
    opacity: off ? 0 : centred ? 1 : SIDE_OPACITY,
  };
}

/** How out of focus a cake in this slot is. The centre is 0px in every branch,
 *  which is the one rule of the whole depth-of-field: the cake being looked at
 *  is never softened, so this cannot return anything else for it. Tier-free
 *  since the radius stopped varying by breakpoint — see SIDE_BLUR_PX. */
function blurFor(slot: HeroSlot | OffStage): string {
  return `blur(${slot === "centre" ? 0 : SIDE_BLUR_PX}px)`;
}

/** How far a cake in this slot is turned, and towards what. Both off-stage
 *  parking places keep the angle of the side they pass through, so a cake
 *  entering or leaving is already at the pose of the slot it is crossing and
 *  the turn has nothing left to do at the edges. */
function tiltFor(slot: HeroSlot | OffStage): { rotateY: number; transformPerspective: number } {
  const rotateY =
    slot === "left" || slot === "offLeft"
      ? SIDE_ROTATE_Y
      : slot === "right" || slot === "offRight"
        ? -SIDE_ROTATE_Y
        : 0;
  return { rotateY, transformPerspective: TILT_PERSPECTIVE };
}

/**
 * The off-stage position a cake in this slot enters from and leaves towards.
 *
 * Derived from the slot rather than from the direction of travel, which is
 * what keeps it correct when the visitor reverses: a cake only ever leaves
 * through the side it is already on, whichever way the window last moved.
 * (A direction prop would be read from the LAST render for a cake that is
 * being removed, i.e. one step out of date, and send it flying across the
 * stage instead of off the near edge.)
 */
function offStageFor(slot: HeroSlot): HeroSlot | OffStage {
  if (slot === "left") return "offLeft";
  if (slot === "right") return "offRight";
  // A lone image is the centre and never enters or leaves; fading in place is
  // the only sensible answer, and nothing ever asks for it.
  return "centre";
}

/**
 * @param slot     Which of the three places this cake occupies right now.
 * @param src      A URL already checked against next/image's allow-list
 *                 upstream (isRenderableHeroImageUrl), so this renders it
 *                 without a guard.
 * @param tier     The active breakpoint, or null before the first effect has
 *                 run — null means "don't animate anything yet, the classes
 *                 have it right".
 * @param mode     Which clock this step runs on — see THREE MOTION MODES.
 * @param float    Run the continuous drift and its shadow parallax. False under
 *                 prefers-reduced-motion, where the cake stands still at the
 *                 resting point of the cycle (FLOAT_REST).
 * @param phase    0 · 1 · 2 — which of the three staggered float offsets this
 *                 cake drifts on. Fixed for its whole life (see
 *                 FLOAT_TRANSITIONS).
 * @param priority True for the centre cake — the hero's LCP.
 *
 * Memoised because the stage re-renders on every autoplay tick and every
 * hover: with primitive props only, a cake whose slot and image are unchanged
 * costs a reference comparison instead of a render.
 */
export const HeroCake = memo(function HeroCake({
  slot,
  src,
  tier,
  mode,
  float,
  phase,
  priority = false,
}: {
  slot: HeroSlot;
  src: string;
  tier: HeroTier | null;
  mode: HeroMotionMode;
  float: boolean;
  phase: number;
  priority?: boolean;
}) {
  // A photo that 404s (deleted from storage behind the admin's back) must not
  // leave a broken-image glyph in the middle of the hero. The slot keeps its
  // box and its place on the ring, so the composition keeps its shape and the
  // carousel keeps rotating; the slot is simply empty.
  const [failed, setFailed] = useState(false);
  // A cake keeps its image for its whole life, so this only fires when the
  // admin's list itself changes under a key that survives — a reorder, or an
  // edit on a hero too short to rotate.
  useEffect(() => setFailed(false), [src]);

  // Captured at mount, deliberately. `priority` marks the LCP, and the LCP is
  // the cake that OPENS in the centre — not every cake that later arrives
  // there. Read live, this would flip on with each rotation and have Next emit
  // a fresh <link rel="preload"> for an image the carousel has already painted
  // (it arrives from the right slot, where it was loaded a turn ago, and the
  // one genuinely new image is handled by useHeroImagePreload). A cake that
  // mounts off to the right is never the LCP, so it never asks to be.
  const [isLcp] = useState(priority);

  const offStage = offStageFor(slot);
  const step = STEP_TRANSITION[mode];
  // The crossing moves the slot and tilt boxes in every mode but `reduced`,
  // where geometry snaps and only opacity tweens. See WILL-CHANGE IS A PROMISE.
  const crossingHint = mode === "reduced" ? "" : TRANSFORM_HINT;

  // WHERE A CAKE ENTERS FROM AND LEAVES TOWARDS.
  //
  // Under full motion it is the off-stage parking place on the side the cake is
  // crossing (offStageFor): it flies in from beyond the edge and leaves the same
  // way, which is the whole cover-flow read.
  //
  // Under REDUCED motion it is the cake's OWN slot at zero opacity, and that
  // distinction is the difference between a dissolve and a disappearance.
  // Nothing travels in that mode, so an off-stage target would snap the cake
  // 250% across the stage on its first frame and then fade it where nobody can
  // see it — the fade would be spent entirely off-screen and the visitor would
  // read it as the cake vanishing. Fading in place is the only version of
  // "leaving" that exists when leaving cannot be shown as movement.
  //
  // `undefined` until the tier is known: the server has no viewport, so the
  // classes place the cake and there is no honest motion target yet.
  const edge =
    tier === null
      ? undefined
      : mode === "reduced"
        ? { ...targetFor(slot, tier), opacity: 0 }
        : targetFor(offStage, tier);

  // The drift and the depth both need real numbers, and before the first effect
  // there is no viewport to get them from. Until then the cake stands at the
  // middle of its arc with the narrow tier's shadow — which is also what the
  // server rendered, so the handoff has nothing to correct.
  const drifting = float && tier !== null;
  // `phase` arrives already folded to 0 · 1 · 2 (wrapIndex in hero-cakes.tsx);
  // the modulo is belt and braces so an out-of-range caller lands on a real
  // clock rather than on `undefined` and an untimed animation.
  const floatTransition = FLOAT_TRANSITIONS[phase % FLOAT_TRANSITIONS.length];

  return (
    <motion.div
      className={`${CAKE_BOX} ${SLOT_CLASS[slot]} ${crossingHint}`}
      style={{ zIndex: SLOT_DEPTH[slot] }}
      // Mounting cakes come in from off-stage. On the very first render there
      // is no tier yet, so this is `false` and the classes do the placing —
      // which is also what keeps the server's HTML and the client's first
      // paint identical.
      initial={edge ?? false}
      animate={tier ? targetFor(slot, tier) : undefined}
      exit={edge}
      transition={step}
    >
      {/* THE HOVER BOX — desktop only, and only because a cursor is the only
          thing that can enter it. Framer's hover gesture is driven by
          pointerenter/pointerleave for a MOUSE; a touch never opens it, so
          there is no sticky :hover left behind on a phone after a swipe.

          It is its own element so the 1.02 sits between the slot transform and
          the tilt and overwrites neither. `group` so the contact shadow below
          can answer the same hover in CSS without Framer having to own an
          opacity that is already running a keyframe loop. */}
      <motion.div
        className="group absolute inset-0 cursor-pointer active:cursor-grabbing"
        whileHover={drifting ? { scale: HOVER_SCALE } : undefined}
        transition={HOVER_TRANSITION}
      >
        {/* THE CONTACT SHADOW — on the surface, under the stand, OUTSIDE the
            float box so it stays on the ground while the cake rises off it, and
            outside the tilt box because the ground does not turn with the cake
            standing on it. The wrapper carries the slot's strength as a static
            class; the inner node carries the parallax and nothing else.

            NOT BLURRED, and it does not need to be: it is a radial gradient
            that fades to nothing at its rim, so it has no edge for a couple of
            pixels of defocus to soften. Blurring it would mean putting a filter
            above an animation that never stops — see THE LENS. */}
        {/* The strength swap rides the SAME curve as the crossing, so the
            shadow under a cake arriving in the centre darkens over exactly the
            span the cake takes to get there. At the old 300ms it was fully dark
            two thirds of the way through the move — the one property that
            finished early.

            THE CLOCK IS INLINE, THE VALUE IS NOT. Only the timing is set here;
            the opacity itself still comes from SHADOW_STRENGTH's classes, which
            is what keeps the `group-hover` variant working — a Framer `animate`
            or an inline opacity would win over the hover rule and silently kill
            it. Inline rather than arbitrary duration and easing utilities,
            because those two candidates did not survive Tailwind's extractor
            here and the element quietly kept the 150ms default that
            transition-opacity ships with. Inline needs no build step to agree
            with it — and it is DERIVED from CROSSING rather than restated, so
            retuning the step retunes the shadow with it and the two can never
            be left apart. (The utility names are described rather than spelled
            out above: written literally they are picked up by the extractor as
            real candidates and warned about as ambiguous.) */}
        {/* GONE WITH THE PHOTO. A contact shadow is cast BY something; drawn
            under a slot whose image failed to load it is an ellipse on the
            plate with nothing above it, which reads as a smudge rather than as
            an empty slot. The slot still keeps its box and its place on the
            ring — only the shadow of a cake that isn't there is removed. */}
        {failed ? null : (
          <div
            aria-hidden
            className={`${CONTACT_SHADOW_BOX} ${SHADOW_STRENGTH[slot]}`}
            style={SHADOW_STRENGTH_TRANSITION[mode]}
          >
            <motion.div
              className={`h-full w-full ${drifting ? "will-change-[transform,opacity]" : ""}`}
              style={{ backgroundImage: CONTACT_SHADOW_FILL }}
              animate={drifting ? { scale: SHADOW_SCALE, opacity: SHADOW_OPACITY } : SHADOW_REST}
              transition={drifting ? floatTransition : INSTANT}
            />
          </div>
        )}

        {/* THE TILT — the side cakes' faces turned back towards the centre, and
            the only rotation anywhere in the hero. Its own element for the usual
            reason: `rotateY` and the float's `y` are both `transform`, so on one
            node the loop and the pose would be one string overwriting itself
            every frame.

            The perspective is written into this element's OWN transform rather
            than inherited from a `perspective` on the track, because the track
            is one box for three cakes and a shared vanishing point would put the
            side cakes' at the stage centre instead of their own. */}
        <motion.div
          className={`absolute inset-0 ${crossingHint} ${SLOT_TILT_CLASS[slot]}`}
          initial={false}
          animate={tier ? tiltFor(slot) : undefined}
          transition={step}
        >
          {/* THE FLOAT — the only thing on this element, forever. `z: 0` is what
              makes Framer emit translate3d() rather than translateY(), so the
              drift is composited on the GPU and never touches layout. */}
          <motion.div
            className={`absolute inset-0 ${drifting ? TRANSFORM_HINT : ""}`}
            animate={drifting ? { y: FLOAT_Y[tier], z: 0 } : FLOAT_REST}
            transition={drifting ? floatTransition : INSTANT}
          >
            {/* THE PHOTO, AND NOTHING BEHIND IT.
                Hero images are uploaded as transparent PNGs, so this wrapper
                draws NOTHING: no fill, no rounded mask, no ring, no box-shadow.
                It exists only to give `fill` a positioned box to measure
                against. Anything painted here would show through the PNG's
                transparency as a shape around the cake — which is exactly what
                a background, a `rounded-full` clip or a ring is. The hero's own
                plate (home-slider.tsx) is the only background under a cake, and
                it stays whole because nothing here covers it.

                The drop shadow is the one exception, and it is not a shape: a
                `filter` is cast from the image's ALPHA, so it exists only where
                the cake does and the transparent margin stays transparent.

                object-CONTAIN, not cover: cover fills the square by cropping,
                which on a cake that is wider or taller than its box quietly
                slices the top or the sides off. Contain fits the whole PNG
                inside and leaves the rest transparent, so what renders is the
                file as uploaded.

                IT IS ALSO THE LENS. The depth-of-field blur is applied here,
                at the very bottom of the stack, and the position matters more
                than it looks: a filter has to re-run every time the thing under
                it repaints, so a blur placed ABOVE the float would be recomputed
                sixty times a second for as long as the page was open — two side
                cakes permanently re-blurring while they drift. Below it, the
                content is a single static photo: the browser rasterises the
                blurred cake ONCE and every transform above this node then
                composites that cached layer for free. The only frames that cost
                anything are the half-second the radius is actually changing.

                `will-change: filter` rides with the blur in SLOT_BLUR_CLASS, so
                it is present on exactly the cakes that have something to blur
                and absent from the centre — which never gains a filter hint, a
                filter layer, or a reason to rasterise at anything but its true
                size. */}
            <motion.div
              className={`relative h-full w-full ${SLOT_BLUR_CLASS[slot]}`}
              initial={false}
              animate={tier ? { filter: blurFor(slot) } : undefined}
              transition={step}
            >
              {failed ? null : (
                <Image
                  src={src}
                  alt=""
                  fill
                  // `priority` already implies eager, and passing both is a Next
                  // warning — hence the undefined on the LCP cake. Every other
                  // cake is on stage the moment it mounts, so none is ever lazy
                  // either.
                  priority={isLcp}
                  loading={isLcp ? undefined : "eager"}
                  sizes={HERO_CAKE_SIZES}
                  onError={() => setFailed(true)}
                  // Photos are draggable by default in every browser, which
                  // starts a native image drag and kills a swipe halfway
                  // through.
                  draggable={false}
                  // Set once, never animated. The three drop-shadow passes
                  // rasterise the silhouette a single time and every transform
                  // above this node then composites that cached layer —
                  // animating the filter itself would re-rasterise the cake on
                  // every frame instead.
                  style={{ filter: CAKE_DROP_SHADOW[tier ?? "base"] }}
                  className="select-none object-contain"
                />
              )}
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
});

/**
 * Which breakpoint tier is active, or null until the first effect runs.
 *
 * Null is not a placeholder value, it is the SSR answer: the server has no
 * viewport, so no motion target can be honest yet, and the cakes are placed by
 * their classes until one is. Two media queries and no resize listener — the
 * geometry is proportional, so only crossing a breakpoint changes anything.
 */
export function useHeroTier(): HeroTier | null {
  const [tier, setTier] = useState<HeroTier | null>(null);

  useEffect(() => {
    const lg = window.matchMedia("(min-width: 1024px)");
    const sm = window.matchMedia("(min-width: 640px)");
    const read = () => setTier(lg.matches ? "lg" : sm.matches ? "sm" : "base");
    read();
    lg.addEventListener("change", read);
    sm.addEventListener("change", read);
    return () => {
      lg.removeEventListener("change", read);
      sm.removeEventListener("change", read);
    };
  }, []);

  return tier;
}
