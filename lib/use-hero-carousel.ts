"use client";

// ============================================================
// Le Rasa Bakery — hero carousel STATE
// ------------------------------------------------------------
// The React half of the engine, and deliberately the thin half: one number of
// state (the position of the window) plus the two ways to change it. Every rule
// about what that number means lives in lib/hero-carousel.ts, which is pure —
// so the arithmetic can be read without React in the way, and this file can be
// read without arithmetic in the way.
//
// THE POSITION IS A COUNTER, NOT AN INDEX. It counts steps taken and never
// wraps; the image it points at is derived by wrapping it. That gives every
// cake on stage a key that is unique over time (see heroStep), which is what
// the animation needs to tell a cake that is LEAVING from the same image
// arriving on the other side.
//
// WHAT IT DOES NOT DO. Nothing here decides WHEN to move: no timer, no
// gesture, no key handler. It exposes `next` / `prev` and lets the component
// own its inputs — the autoplay clock is lib/use-hero-autoplay.ts, and the
// gestures belong to the component that has the drag surface.
// ============================================================

import { useCallback, useMemo, useState } from "react";
import {
  heroOpeningIndex,
  heroRotates,
  heroStageFrom,
  heroStep,
  heroWindowAt,
  type HeroStageCake,
  type HeroWindow,
} from "@/lib/hero-carousel";

export type HeroCarousel = {
  /** Monotonic step counter. Also the centre cake's React key. */
  position: number;
  /** Which images are on stage right now, and the one to fetch ahead.
   *  Named `slots` rather than `window` so no consumer can destructure a name
   *  that shadows the global one it may also need. */
  slots: HeroWindow;
  /** The same window as a mounted list: what to render, keyed for animation. */
  stage: HeroStageCake[];
  /** Walk the window one place towards the end of the list (wraps on read). */
  next: () => void;
  /** Walk it one place back. */
  prev: () => void;
  /** False when there are too few images for a step to mean anything. */
  rotates: boolean;
};

/**
 * @param count How many images the hero has. The hook holds one integer, so it
 *   never sees the images themselves and re-renders no more often than the
 *   window actually moves.
 */
export function useHeroCarousel(count: number): HeroCarousel {
  // The opening arrangement is computed once, on mount: it is the frame the
  // server rendered, and re-deriving it later would yank a visitor back to the
  // start every time the parent re-rendered.
  const [position, setPosition] = useState(() => heroOpeningIndex(count));

  const rotates = heroRotates(count);

  // Functional updates, so the callbacks depend on `count` alone and stay
  // referentially stable across every step. A `next` that changed identity on
  // each rotation would restart any effect that depends on it — including the
  // autoplay clock, which would then never complete a full interval.
  const step = useCallback(
    (direction: 1 | -1) => {
      if (!heroRotates(count)) return;
      setPosition((current) => heroStep(current, direction));
    },
    [count],
  );

  const next = useCallback(() => step(1), [step]);
  const prev = useCallback(() => step(-1), [step]);

  // The window is solved ONCE per move and the stage is derived from it, so
  // the two can never disagree about which images are up. Both are memoised
  // because their identity feeds React's reconciliation and the memoised cakes
  // compare their props by reference.
  const slots = useMemo(() => heroWindowAt(position, count), [position, count]);
  const stage = useMemo(() => heroStageFrom(slots, position), [slots, position]);

  return { position, slots, stage, next, prev, rotates };
}
