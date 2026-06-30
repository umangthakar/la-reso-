"use client";

// ============================================================
// useIsMobile — viewport-width hook for the admin panel.
//
// The admin panel is styled with inline `style={{}}` objects, which can't
// carry CSS media queries, so responsive behaviour is driven in JS instead.
// This hook reports whether the viewport is below `breakpoint` (default
// 768px) and updates live on resize / orientation change.
//
// SSR-safe: returns `false` (desktop) during server render and the first
// client paint, then corrects after mount. That means the desktop layout
// is the default and never regressed — mobile adjustments apply on top.
// ============================================================

import { useEffect, useState } from "react";

export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}
