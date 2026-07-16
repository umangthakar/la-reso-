"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ShoppingBag, Phone, Star, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo-mark";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/use-auth";
import { useSiteSettings } from "@/lib/use-site-settings";
import { useGoogleRating } from "@/lib/use-google-rating";
import { CartButton } from "@/components/cart/cart-button";
import { HeaderSearch } from "@/components/header-search";

const links = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" },
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact Us" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const { user, ready } = useAuth();
  const { settings } = useSiteSettings();
  // Live Google Business rating — the only source for the figure below. 0 =
  // nothing to show yet, in which case the badge is hidden rather than faked.
  const { rating } = useGoogleRating();
  const initial = user?.name.trim().charAt(0).toUpperCase();

  // Phone comes solely from the DB (site_settings.contact.phone). No hardcoded number.
  const phone = settings.contact.phone.trim();
  const telHref = phone ? `tel:${phone.replace(/\s+/g, "")}` : "";

  // The home route ("/") is the full-screen splash entry animation, so the
  // navbar stays hidden there and slides into view on every other page.
  const revealed = pathname !== "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <motion.header
      className="sticky top-0 z-50"
      initial={false}
      animate={{ y: revealed ? "0%" : "-105%", opacity: revealed ? 1 : 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      style={{ pointerEvents: revealed ? "auto" : "none" }}>
      {/* Top utility bar */}
      <div className="bg-darkberry text-blush-50">
        <div className="container flex h-9 items-center justify-between gap-3 text-[11px] font-semibold sm:text-xs">
          {phone ? (
            <a
              href={telHref}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-dustyrose-light"
            >
              <Phone className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{phone}</span>
              <span className="sm:hidden">Call us</span>
            </a>
          ) : (
            <span />
          )}
          {/* Live Google rating. Hidden until it loads (and whenever there's
              no live figure), so the bar keeps its two-item justify-between
              balance via the empty span rather than showing a stale number. */}
          {rating > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 fill-dustyrose text-dustyrose" />
              <span>{rating.toFixed(1)}/5 on Google</span>
            </span>
          ) : (
            <span />
          )}
        </div>
      </div>

      {/* Main nav */}
      <div
        className={cn(
          "border-b transition-all duration-300",
          scrolled
            ? "border-wine/10 bg-[#F9EEEA]/95 shadow-clay-sm backdrop-blur-md"
            : "border-transparent bg-[#F9EEEA]/80 backdrop-blur-sm"
        )}
      >
        <nav className="container flex items-center justify-between py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark logo={settings.logo} />
            <span className="flex flex-col leading-none">
              <span className="font-display text-lg font-semibold text-darkberry">
                Le Rasa
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-wine-dark">
                Eggless Bakery
              </span>
            </span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {links.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "relative rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "text-wine-dark"
                      : "text-darkberry/80 hover:text-wine-dark"
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 -z-10 rounded-full bg-dustyrose-light/70"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Product search — desktop: inline between the nav links and the
              cart/profile group. Mobile: the icon inside that group below. */}
          <HeaderSearch variant="desktop" />

          <div className="flex items-center gap-2">
            <HeaderSearch variant="mobile" />

            {/* Cart: opens the slide-in drawer; badge shows live item count. */}
            <CartButton />

            {/* Account: shows the signed-in initial, otherwise routes to login. */}
            <Link
              href={ready && user ? "/account" : "/account/login"}
              aria-label={ready && user ? "My account" : "Sign in"}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blush-50 text-darkberry shadow-clay-sm transition-shadow hover:shadow-clay"
            >
              {ready && user ? (
                <span className="font-display text-sm font-semibold text-wine-dark">
                  {initial}
                </span>
              ) : (
                <User className="h-5 w-5" />
              )}
            </Link>
            <Button asChild size="sm" className="px-3 text-xs sm:px-5 sm:text-sm">
              <Link href="/contact">
                <ShoppingBag className="h-4 w-4" />
                <span className="hidden sm:inline">Order Now</span>
                <span className="sm:hidden">Order</span>
              </Link>
            </Button>
            <button
              onClick={() => setOpen((v) => !v)}
              className="grid h-10 w-10 place-items-center rounded-full bg-blush-50 text-darkberry shadow-clay-sm md:hidden"
              aria-label="Toggle menu"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="container mt-2 md:hidden"
          >
            <div className="glass flex flex-col gap-1 rounded-3xl p-3 shadow-clay-sm">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-2xl px-4 py-3 text-base font-semibold text-darkberry transition-colors hover:bg-dustyrose-light/60"
                >
                  {link.label}
                </Link>
              ))}
              <Button asChild className="mt-1">
                <Link href="/contact">
                  <ShoppingBag className="h-4 w-4" />
                  Order Now
                </Link>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
