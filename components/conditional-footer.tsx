"use client";

import { usePathname } from "next/navigation";
import { Footer } from "@/components/footer";

/**
 * The home route ("/") is the full-screen splash that redirects to the menu,
 * so it has no footer. Every other page renders the shared footer.
 */
export function ConditionalFooter() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <Footer />;
}
