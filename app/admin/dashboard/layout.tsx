"use client";

// ============================================================
// Le Rasa Bakery — Admin dashboard shell
// Renders the sidebar navigation and guards every dashboard page:
// if the admin isn't signed in, it redirects to /admin.
//
// Responsive: full sticky sidebar on desktop; on mobile (<768px) it
// collapses to a top bar with a ☰ button that opens a slide-in drawer.
// Layout is driven by the JS useIsMobile() hook because the panel is
// styled with inline styles (no Tailwind classes here).
// ============================================================

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useIsMobile } from "@/lib/use-is-mobile";

const BLUSH = "#F9EEEA";
const WINE = "#873853";
const BERRY = "#5C2A41";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", exact: true },
  { href: "/admin/dashboard/products", label: "Products" },
  { href: "/admin/dashboard/accessories", label: "Accessories" },
  { href: "/admin/dashboard/offers", label: "Offers" },
  { href: "/admin/dashboard/orders", label: "Orders" },
  { href: "/admin/dashboard/inquiries", label: "Inquiries" },
  { href: "/admin/dashboard/payments", label: "Payments" },
  { href: "/admin/dashboard/delivery", label: "Delivery Settings" },
  // `exact` so the nested WhatsApp route below doesn't also light this up.
  { href: "/admin/dashboard/settings", label: "Content & Settings", exact: true },
  // Its own module, not a section of Content & Settings: hero images are rows
  // in their own table with their own routes, so they get their own page. Sits
  // next to Content because that is where the admin looks for site imagery.
  { href: "/admin/dashboard/hero-slider", label: "Hero Slider" },
  { href: "/admin/dashboard/settings/whatsapp", label: "WhatsApp" },
  { href: "/admin/dashboard/reviews", label: "Google Reviews" },
  { href: "/admin/dashboard/policies", label: "Policies" },
  { href: "/admin/dashboard/analytics", label: "Analytics" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [ready, setReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer whenever the route changes or we grow back to desktop.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname, isMobile]);

  useEffect(() => {
    // The session lives in an httpOnly cookie, so the client cannot inspect it
    // — it asks the server instead. The cookie rides along automatically.
    let active = true;
    fetch("/api/admin/session", { cache: "no-store", credentials: "same-origin" })
      .then((res) => {
        if (!active) return;
        if (res.ok) setReady(true);
        else router.replace("/admin");
      })
      .catch(() => {
        if (active) router.replace("/admin");
      });
    return () => {
      active = false;
    };
  }, [router]);

  function logout() {
    // Only the server can clear an httpOnly cookie. Navigate regardless of the
    // outcome so a failed request can never trap the admin in the dashboard.
    void fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" })
      .catch(() => {})
      .finally(() => router.replace("/admin"));
  }

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", background: BLUSH, display: "grid", placeItems: "center", color: BERRY, fontFamily: "system-ui, sans-serif" }}>
        Loading…
      </div>
    );
  }

  // Sidebar styling: a sticky column on desktop, a fixed slide-in drawer on
  // mobile (transform animates it on/off screen).
  const asideStyle: React.CSSProperties = isMobile
    ? {
        width: 260,
        maxWidth: "82vw",
        background: "white",
        borderRight: "1px solid rgba(135,56,83,0.12)",
        padding: "1.25rem 1rem",
        display: "flex",
        flexDirection: "column",
        position: "fixed",
        top: 0,
        left: 0,
        height: "100vh",
        zIndex: 50,
        transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.25s ease",
        boxShadow: drawerOpen ? "8px 0 40px rgba(60,20,40,0.25)" : "none",
      }
    : {
        width: 230,
        background: "white",
        borderRight: "1px solid rgba(135,56,83,0.12)",
        padding: "1.5rem 1rem",
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 0,
        height: "100vh",
      };

  const navLinkBase: React.CSSProperties = {
    padding: isMobile ? "12px 14px" : "10px 14px",
    minHeight: isMobile ? 44 : undefined,
    display: "flex",
    alignItems: "center",
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: 600,
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: isMobile ? "column" : "row", background: BLUSH, fontFamily: "system-ui, -apple-system, sans-serif", color: BERRY }}>
      {/* Mobile top bar */}
      {isMobile && (
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0.6rem 0.85rem",
            background: "white",
            borderBottom: "1px solid rgba(135,56,83,0.12)",
          }}
        >
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              border: "1px solid rgba(135,56,83,0.18)",
              background: "white",
              color: WINE,
              fontSize: "1.4rem",
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ☰
          </button>
          <span style={{ color: WINE, fontWeight: 800, fontSize: "1.05rem" }}>Le Rasa Admin</span>
        </header>
      )}

      {/* Drawer scrim (mobile only, when open) */}
      {isMobile && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(60,20,40,0.45)", zIndex: 45 }}
        />
      )}

      {/* Sidebar / drawer */}
      <aside style={asideStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0.5rem 1.5rem" }}>
          <span style={{ color: WINE, fontWeight: 800, fontSize: "1.2rem" }}>Le Rasa Admin</span>
          {isMobile && (
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              style={{ width: 36, height: 36, border: "none", background: "transparent", color: BERRY, fontSize: "1.5rem", lineHeight: 1, cursor: "pointer" }}
            >
              ×
            </button>
          )}
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                style={{
                  ...navLinkBase,
                  color: active ? "white" : BERRY,
                  background: active ? WINE : "transparent",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={logout}
          style={{
            marginTop: 16,
            padding: "10px 14px",
            minHeight: isMobile ? 44 : undefined,
            borderRadius: 10,
            border: `1px solid ${WINE}`,
            background: "transparent",
            color: WINE,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Log out
        </button>
      </aside>

      {/* Content */}
      {/* A plain container, not <main>: the root layout already provides the
          document's single <main> landmark, and nesting a second one inside it
          is invalid HTML. Styling is identical. */}
      <div style={{ flex: 1, padding: isMobile ? "1.25rem 1rem" : "2rem", overflowX: "auto", width: isMobile ? "100%" : "auto", boxSizing: "border-box" }}>
        {children}
      </div>
    </div>
  );
}
