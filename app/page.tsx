"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SplashScreen } from "@/components/splash-screen";

export default function HomePage() {
  const router = useRouter();
  // Undecided until we know the viewport, so we never flash the splash on mobile.
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  // Mobile skips the video splash entirely and goes straight to /home.
  useEffect(() => {
    if (window.innerWidth < 768) {
      router.replace("/home");
      return;
    }
    setIsMobile(false);
  }, [router]);

  // Desktop: play the entry video, then land on /home.
  if (isMobile === false) {
    return <SplashScreen onComplete={() => router.push("/home")} />;
  }

  // Mobile (or first paint before measuring): render nothing while we redirect.
  return null;
}
