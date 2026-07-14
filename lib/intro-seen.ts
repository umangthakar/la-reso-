// ============================================================
// Le Rasa Bakery — intro animation "already played" flag
// ------------------------------------------------------------
// The entry animation lives on "/" and the navbar's Home link points
// there, so every trip back to Home used to replay it. This flag makes
// it a once-per-browser-session event: the first visit gets the full
// splash, and every later visit to "/" (Home link, browser back/forward,
// refresh) goes straight to the homepage.
//
// sessionStorage — not localStorage — so a brand-new tab or window still
// gets the animation, exactly as a new visitor would.
// ============================================================

const KEY = "lerasa_intro_played";

/** True once the entry animation has played in this browser session. */
export function hasSeenIntro(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    // Private mode / storage disabled: fall back to playing the animation.
    return false;
  }
}

/** Remember that the entry animation has played. */
export function markIntroSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    /* nothing to do — the visitor just sees the intro again */
  }
}
