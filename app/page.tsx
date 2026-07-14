"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SplashScreen } from "@/components/splash-screen";
import { hasSeenIntro, markIntroSeen } from "@/lib/intro-seen";

export default function HomePage() {
  const router = useRouter();
  // Undecided until we've checked the viewport and the session flag, so we
  // never flash the splash on mobile or on a repeat visit.
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    // Mobile skips the video splash entirely, and so does every visit to "/"
    // after the first one this session — that's the Home link, browser
    // back/forward and refresh. Straight to /home, no animation.
    if (window.innerWidth < 768 || hasSeenIntro()) {
      router.replace("/home");
      return;
    }

    // Marked before the animation plays, not after: leaving mid-splash and
    // coming back must not restart it either.
    markIntroSeen();
    setShowSplash(true);
  }, [router]);

  // Desktop, first visit: play the entry video, then land on /home.
  if (showSplash) {
    return <SplashScreen onComplete={() => router.push("/home")} />;
  }

  // Mobile / repeat visit (or first paint before measuring): render nothing
  // while we redirect.
  return null;
}
