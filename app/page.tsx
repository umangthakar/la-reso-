"use client";

import { useRouter } from "next/navigation";
import { SplashScreen } from "@/components/splash-screen";

export default function HomePage() {
  const router = useRouter();

  // The entry screen plays the hero animation; when it finishes we send the
  // visitor straight to the menu.
  return <SplashScreen onComplete={() => router.push("/menu")} />;
}
