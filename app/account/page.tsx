"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Package,
  Heart,
  MapPin,
  CreditCard,
  Gift,
  Star,
  Settings,
  LogOut,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";

const menu = [
  { icon: Package, label: "My Orders", href: "/account/orders" },
  { icon: Heart, label: "Wishlist", href: "/account/wishlist" },
  { icon: MapPin, label: "Addresses", href: "/account/addresses" },
  { icon: CreditCard, label: "Payments", href: "/account/payments" },
  { icon: Gift, label: "Coupons", href: "/account/coupons" },
  { icon: Star, label: "Reviews", href: "/account/reviews" },
  { icon: Settings, label: "Settings", href: "/account/settings" },
];

export default function AccountPage() {
  const router = useRouter();
  const { user, ready, logout } = useAuth();

  // Guard: once we know there's no user, bounce to the login page.
  useEffect(() => {
    if (ready && !user) router.replace("/account/login");
  }, [ready, user, router]);

  function handleLogout() {
    logout();
    router.replace("/account/login");
  }

  if (!ready || !user) {
    return (
      <section className="pt-28 sm:pt-36">
        <div className="container flex min-h-[40vh] items-center justify-center">
          <p className="text-darkberry-light">Loading…</p>
        </div>
      </section>
    );
  }

  const initial = user.name.trim().charAt(0).toUpperCase() || "U";

  return (
    <section className="relative overflow-hidden pb-16 pt-28 sm:pt-36">
      <div className="pointer-events-none absolute -left-20 top-28 h-64 w-64 rounded-full bg-dustyrose/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-20 h-72 w-72 rounded-full bg-dustyrose/25 blur-3xl" />

      <div className="container relative mx-auto max-w-xl">
        {/* Profile card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-4 rounded-clay bg-blush-50 p-5 shadow-clay sm:p-6"
        >
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-wine font-display text-2xl font-semibold text-blush-50 shadow-clay-sm sm:h-20 sm:w-20 sm:text-3xl">
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl font-semibold text-darkberry sm:text-2xl">
              {user.name}
            </h1>
            <p className="truncate text-sm text-darkberry-light">
              {user.email}
            </p>
          </div>
          <Button asChild variant="secondary" size="sm" className="shrink-0">
            <Link href="/account/settings">
              <Pencil className="h-4 w-4" />
              <span className="hidden sm:inline">Edit Profile</span>
            </Link>
          </Button>
        </motion.div>

        {/* Menu list */}
        <motion.ul
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 divide-y divide-wine/10 overflow-hidden rounded-clay bg-blush-50 shadow-clay-sm"
        >
          {menu.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-dustyrose-light/40"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-dustyrose-light text-wine-dark">
                  <item.icon className="h-5 w-5" />
                </span>
                <span className="flex-1 font-semibold text-darkberry">
                  {item.label}
                </span>
                <ChevronRight className="h-5 w-5 text-darkberry-light/60" />
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-wine/10"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-wine/15 text-wine">
                <LogOut className="h-5 w-5" />
              </span>
              <span className="flex-1 font-semibold text-wine">Logout</span>
              <ChevronRight className="h-5 w-5 text-wine/50" />
            </button>
          </li>
        </motion.ul>
      </div>
    </section>
  );
}
