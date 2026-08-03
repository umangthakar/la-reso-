"use client";

// ============================================================
// Le Rasa Bakery — storefront chrome boundary
// ------------------------------------------------------------
// The admin panel is a different application that happens to live in the same
// Next tree. It was inheriting the whole storefront shell from the root layout:
// the public navigation, the search box, the CART BUTTON, "Sign in", the
// "Contact for Custom Order" call to action, the announcement bar, the cookie
// banner and the full footer with its policy links — all rendered above and
// below the admin sign-in form and every dashboard page.
//
// This component is the boundary. It renders its children on the storefront and
// nothing at all under /admin, which is the minimal change that gets the two
// apart: no routes move, no URLs change, and every storefront page keeps the
// exact chrome it had. It follows the pattern ConditionalFooter already
// established (that component stays responsible for hiding the footer on the
// "/" splash screen).
//
// Note for a future refactor: the "proper" fix is separate root layouts via
// route groups, but that means relocating every storefront page, which is a far
// larger change than this defect warrants.
// ============================================================

import { usePathname } from "next/navigation";

/** True for the admin panel, including the sign-in page at /admin itself. */
export function useIsAdminRoute(): boolean {
  const pathname = usePathname();
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** Renders `children` on the storefront only — nothing under /admin. */
export function StorefrontOnly({ children }: { children: React.ReactNode }) {
  return useIsAdminRoute() ? null : <>{children}</>;
}
