"use client";

// ============================================================
// Le Rasa Bakery — the hero's autoplay clock
// ------------------------------------------------------------
// Ticks every `intervalMs`, and knows when to keep quiet. It owns no carousel
// state: it is handed a callback and the position that callback moves, so the
// same clock could drive anything that steps.
//
// TWO WAYS TO STOP IT, because they resume differently:
//
//   hold(reason) / release(reason)
//                        an ONGOING reason — the pointer is over the hero, the
//                        hero has focus, a drag is in progress, the tab is in
//                        the background. Several can apply at once, so a drag
//                        that starts inside a hover
//                        doesn't resume the clock when the drag ends and the
//                        pointer is still there. The last release starts a
//                        short grace period, never an immediate restart: a cake
//                        jumping the instant the pointer crosses the edge feels
//                        like the page pouncing on the visitor.
//
//   bump()               a MOMENTARY one — an arrow key, a completed swipe, a
//                        click. There is nothing to release, so it schedules
//                        its own (longer) resume: someone who just chose a cake
//                        is looking at it, and five seconds later is too soon
//                        to take it away.
//
// A SET OF REASONS, NOT A COUNTER, and this is the difference between autoplay
// that resumes and autoplay that silently dies. A counter needs every hold to
// be matched by exactly one release, forever — and pointer events do not
// promise that. A cake unmounting under the cursor mid-rotation, a drag whose
// pointer capture swallows the leave, a focus that never blurs: each one leaks
// a hold, the count never returns to zero, and the carousel stops for the rest
// of the visit with nothing on screen to explain why. Keyed reasons are
// idempotent instead — holding "hover" twice is still one hover, releasing it
// twice is still released — so a duplicate or missing event costs nothing.
//
// A TIMEOUT, NOT AN INTERVAL, keyed on `restartKey`. Every step — automatic or
// not — restarts the clock, so a cake brought in by hand still gets its full
// time on stage, and the interval can never drift out of phase with a manual
// step the way a free-running interval does.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";

/** Why the clock is being held. One name per input, so each input can only
 *  ever hold once however many events it fires. */
export type HeroHoldReason = "hover" | "drag" | "focus" | "hidden";

export type HeroAutoplay = {
  /** Stop for this reason, until it is released. Idempotent. */
  hold: (reason: HeroHoldReason) => void;
  /** Clear this reason; when it was the last one, the clock resumes after the
   *  hover grace period. Idempotent — releasing what was never held is a
   *  no-op, not an unbalanced decrement. */
  release: (reason: HeroHoldReason) => void;
  /** A one-off interaction: pause, then resume after the longer delay. */
  bump: () => void;
  /** Whether the clock is currently allowed to run — for aria-live etc. */
  running: boolean;
};

export function useHeroAutoplay({
  enabled,
  intervalMs,
  hoverResumeMs,
  interactionResumeMs,
  restartKey,
  onTick,
}: {
  /** False turns the clock off entirely (too few images, reduced motion). */
  enabled: boolean;
  intervalMs: number;
  /** Grace period after the last hold is released. */
  hoverResumeMs: number;
  /** Grace period after a deliberate interaction. */
  interactionResumeMs: number;
  /** Changes whenever the carousel moves; restarts the interval. */
  restartKey: number;
  /** Must be referentially stable — it is an effect dependency. */
  onTick: () => void;
}): HeroAutoplay {
  const [running, setRunning] = useState(true);
  // The reasons currently holding the clock. A set, not a boolean, because
  // hover and drag overlap constantly and a boolean would let the end of the
  // drag resume a clock the hover still wants held — and not a count, for the
  // reason set out at the top of this file.
  const holds = useRef<Set<HeroHoldReason>>(new Set());
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelResume = useCallback(() => {
    if (resumeTimer.current !== null) {
      clearTimeout(resumeTimer.current);
      resumeTimer.current = null;
    }
  }, []);

  const resumeAfter = useCallback(
    (delayMs: number) => {
      cancelResume();
      resumeTimer.current = setTimeout(() => {
        resumeTimer.current = null;
        setRunning(true);
      }, delayMs);
    },
    [cancelResume],
  );

  const hold = useCallback(
    (reason: HeroHoldReason) => {
      holds.current.add(reason);
      cancelResume();
      setRunning(false);
    },
    [cancelResume],
  );

  const release = useCallback(
    (reason: HeroHoldReason) => {
      holds.current.delete(reason);
      // Something else still wants it stopped — that hold owns the resume.
      if (holds.current.size > 0) return;
      resumeAfter(hoverResumeMs);
    },
    [hoverResumeMs, resumeAfter],
  );

  const bump = useCallback(() => {
    setRunning(false);
    cancelResume();
    // Under a hold (a key pressed while hovering), the release schedules the
    // resume — scheduling one here as well would restart the clock with the
    // pointer still sitting on the hero.
    if (holds.current.size > 0) return;
    resumeAfter(interactionResumeMs);
  }, [cancelResume, interactionResumeMs, resumeAfter]);

  // A HIDDEN PAGE HOLDS THE CLOCK, and this one is a correctness fix rather
  // than a courtesy.
  //
  // setTimeout keeps firing in a background tab (throttled to ~1/s, and to
  // ~1/min once the tab has been hidden a while), but requestAnimationFrame does
  // NOT — and framer-motion's frameloop is driven purely by rAF, with no
  // setTimeout fallback and no visibility handling of its own. So a hidden tab
  // is the one situation where the two clocks come apart: steps keep landing,
  // each one mounting a cake and marking another for exit, while no animation
  // can advance a single frame to finish any of them. AnimatePresence cannot
  // retire an exiting node until its exit completes, so they accumulate for as
  // long as the tab stays hidden and then all resolve at once on return — a
  // burst of catch-up motion on top of a DOM that has been quietly growing.
  //
  // Holding the clock instead means a backgrounded hero simply stops, which is
  // also what a visitor coming back to a tab expects to find: the cake they
  // left, not the fortieth one after it. It uses the ordinary hold/release
  // path, so it composes with hover, drag and focus for free — coming back to a
  // tab with the pointer already over the hero keeps it paused, correctly.
  useEffect(() => {
    // A page can be loaded straight into a background tab, so the initial state
    // matters as much as the transitions. Only the hidden case is asserted:
    // releasing a reason that was never held would schedule a pointless resume
    // and, worse, could cut short a hold that something else is holding.
    if (document.hidden) hold("hidden");
    const sync = () => {
      if (document.hidden) hold("hidden");
      else release("hidden");
    };
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [hold, release]);

  // The clock itself.
  useEffect(() => {
    if (!enabled || !running) return;
    const id = setTimeout(onTick, intervalMs);
    return () => clearTimeout(id);
  }, [enabled, running, intervalMs, restartKey, onTick]);

  // A pending resume outlives the component otherwise, and fires setState on
  // something that is no longer mounted.
  useEffect(() => cancelResume, [cancelResume]);

  return { hold, release, bump, running };
}
