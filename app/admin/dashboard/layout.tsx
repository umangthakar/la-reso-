"use client";

// ============================================================
// Le Rasa Bakery — Admin dashboard shell
// Renders the sidebar navigation and guards every dashboard page:
// if the admin isn't signed in, it redirects to /admin.
// ============================================================

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ADMIN_AUTH_KEY } from "@/lib/admin-auth";

const BLUSH = "#F9EEEA";
const WINE = "#873853";
const BERRY = "#5C2A41";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", exact: true },
  { href: "/admin/dashboard/products", label: "Products" },
  { href: "/admin/dashboard/orders", label: "Orders" },
  { href: "/admin/dashboard/payments", label: "Payments" },
  { href: "/admin/dashboard/delivery", label: "Delivery Settings" },
  { href: "/admin/dashboard/settings", label: "Content & Settings" },
  { href: "/admin/dashboard/analytics", label: "Analytics" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(ADMIN_AUTH_KEY);
    if (!stored) {
      router.replace("/admin");
      return;
    }
    // Re-validate the stored password against the server, since the
    // correct value no longer lives on the client.
    let active = true;
    fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: stored }),
    })
      .then((res) => {
        if (!active) return;
        if (res.ok) {
          setReady(true);
        } else {
          window.sessionStorage.removeItem(ADMIN_AUTH_KEY);
          router.replace("/admin");
        }
      })
      .catch(() => {
        if (active) router.replace("/admin");
      });
    return () => {
      active = false;
    };
  }, [router]);

  function logout() {
    window.sessionStorage.removeItem(ADMIN_AUTH_KEY);
    router.replace("/admin");
  }

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", background: BLUSH, display: "grid", placeItems: "center", color: BERRY, fontFamily: "system-ui, sans-serif" }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: BLUSH, fontFamily: "system-ui, -apple-system, sans-serif", color: BERRY }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 230,
          background: "white",
          borderRight: "1px solid rgba(135,56,83,0.12)",
          padding: "1.5rem 1rem",
          display: "flex",
          flexDirection: "column",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <div style={{ color: WINE, fontWeight: 800, fontSize: "1.2rem", padding: "0 0.5rem 1.5rem" }}>
          Le Rasa Admin
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  textDecoration: "none",
                  fontWeight: 600,
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
      <main style={{ flex: 1, padding: "2rem", overflowX: "auto" }}>{children}</main>
    </div>
  );
}
