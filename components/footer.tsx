"use client";

import Link from "next/link";
import { Instagram, Facebook, Music2, Mail, MapPin, Phone } from "lucide-react";
import { CardCarousel } from "@/components/ui/card-carousel";
import { LogoMark } from "@/components/logo-mark";
import { useSiteSettings } from "@/lib/use-site-settings";
import { usePolicies } from "@/lib/use-policies";
import { instagramUrl, instagramHandle } from "@/lib/site-settings";

// The static image set shown when no Instagram Reels are configured — keeps
// the "Follow the sweetness" carousel from ever looking empty (backward compat).
const FALLBACK_GALLERY = [
  { src: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&q=80", alt: "Chocolate cake" },
  { src: "https://images.unsplash.com/photo-1519869325930-281384150729?w=400&q=80", alt: "Cupcakes" },
  { src: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&q=80", alt: "Pink cupcakes" },
  { src: "https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400&q=80", alt: "Raspberry cake" },
  { src: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=400&q=80", alt: "Cookies" },
  { src: "https://images.unsplash.com/photo-1548365328-8c6db3220e4d?w=400&q=80", alt: "Chocolate truffles" },
  { src: "https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=400&q=80", alt: "Birthday cake" },
  { src: "https://images.unsplash.com/photo-1587668178277-295251f900ce?w=400&q=80", alt: "Brownies" },
];

// Shown when the matching site_settings field is empty, so the footer never
// looks blank. Phone is intentionally NOT defaulted — it comes solely from
// the DB and its row is hidden when unset (no hardcoded number anywhere).
const FALLBACK = {
  address: "14 Honey Lane, London, E1 6AN",
  email: "hello@lerasabakery.com",
};

export function Footer() {
  const { settings } = useSiteSettings();
  // Admin-managed, from the policies table. No fallback list: if none are
  // enabled, the footer simply shows no policy links.
  const { policies } = usePolicies();

  const address = settings.contact.address.trim() || FALLBACK.address;
  const phone = settings.contact.phone.trim();
  const email = settings.contact.email.trim() || FALLBACK.email;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, "")}` : "";

  // Instagram: one source of truth (settings.instagram_url) → full URL + @handle.
  const igUrl = instagramUrl(settings.instagram_url);
  const igHandle = instagramHandle(settings.instagram_url);

  // Reels gallery: when the admin has added active Reels, each carousel slide
  // shows that reel's admin-uploaded cover image (or a bakery fallback if none)
  // and links out to the reel. With none configured, we keep the existing
  // static image carousel.
  const reels = (settings.instagram_reels ?? []).filter((r) => r.active && r.url);
  const galleryImages =
    reels.length > 0
      ? reels.map((r, i) => ({
          src: r.cover_image || "/reel-fallback.svg",
          alt: r.title || `Instagram reel ${i + 1}`,
          href: r.url,
        }))
      : FALLBACK_GALLERY;

  // Only render social icons whose URL is configured.
  const socials = [
    { Icon: Instagram, href: igUrl },
    { Icon: Facebook, href: settings.facebook_url.trim() },
    { Icon: Music2, href: settings.tiktok_url.trim() },
  ].filter((s) => s.href !== "");

  return (
    <footer className="relative mt-10">
      {/* Instagram carousel — Swiper coverflow */}
      <section className="bg-[#F9EEEA] py-12">
        <div className="mx-auto max-w-7xl px-4">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[#612437]">Follow the sweetness</h2>
              <p className="text-[#9C616D]">
                {igHandle ? `${igHandle} — ` : ""}fresh bakes daily on Instagram
              </p>
            </div>
            {igUrl && (
              <a
                href={igUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-full px-5 py-2 font-semibold text-white"
                style={{ background: "#873853" }}
              >
                Follow us
              </a>
            )}
          </div>

          {/* Carousel — dynamic Instagram reel thumbnails when configured,
              else the static fallback set. Same coverflow animation/layout. */}
          <CardCarousel
            images={galleryImages}
            autoplayDelay={2000}
            showPagination={true}
            showNavigation={false}
            unoptimized={reels.length > 0}
          />
        </div>
      </section>

      {/* Main footer */}
      <div className="bg-darkberry text-blush-100">
        <div className="container grid gap-10 py-10 text-center sm:grid-cols-2 sm:py-14 sm:text-left lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center justify-center gap-2.5 sm:justify-start">
              <LogoMark logo={settings.logo} />
              <span className="flex flex-col leading-none">
                <span className="font-display text-lg font-semibold text-blush-50">
                  {settings.branding.short_name}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-dustyrose">
                  {settings.branding.tagline}
                </span>
              </span>
            </Link>
            <p className="mx-auto mt-4 max-w-xs text-sm text-blush-100/70 sm:mx-0">
              {settings.branding.footer_description}
            </p>
            {socials.length > 0 && (
              <div className="mt-5 flex justify-center gap-3 sm:justify-start">
                {socials.map(({ Icon, href }, i) => (
                  <a
                    key={i}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="grid h-10 w-10 place-items-center rounded-full bg-blush-100/10 text-blush-50 transition-colors hover:bg-wine"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="font-display text-base font-semibold text-blush-50">
              Explore
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm text-blush-100/70">
              {[
                { href: "/", label: "Home" },
                { href: "/menu", label: "Full Menu" },
                { href: "/about", label: "Our Story" },
                { href: "/contact", label: "Order Now" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-dustyrose">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display text-base font-semibold text-blush-50">
              Treats
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm text-blush-100/70">
              {[
                "Birthday Cakes",
                "Cupcakes",
                "Custom Cakes",
                "Brownies",
                "Cookies",
                "Gift Boxes",
              ].map((l) => (
                <li key={l}>
                  <Link href="/menu" className="transition-colors hover:text-dustyrose">
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display text-base font-semibold text-blush-50">
              Visit & Order
            </h4>
            <ul className="mt-4 space-y-3 text-sm text-blush-100/70">
              <li className="flex items-start justify-center gap-2.5 sm:justify-start">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-dustyrose" />
                {address}
              </li>
              {phone && (
                <li className="flex items-center justify-center gap-2.5 sm:justify-start">
                  <Phone className="h-4 w-4 shrink-0 text-dustyrose" />
                  <a href={telHref} className="transition-colors hover:text-dustyrose">
                    {phone}
                  </a>
                </li>
              )}
              <li className="flex items-center justify-center gap-2.5 sm:justify-start">
                <Mail className="h-4 w-4 shrink-0 text-dustyrose" />
                <a href={`mailto:${email}`} className="transition-colors hover:text-dustyrose">
                  {email}
                </a>
              </li>
            </ul>
            <p className="mt-4 text-xs text-blush-100/60">
              Open Tue–Sun · 9am – 7pm
            </p>
          </div>
        </div>

        {/* Policy links — order, labels and visibility all come from the
            admin panel (the policies table). Renders nothing when none are
            enabled, so the bar keeps its original two-item layout. */}
        {policies.length > 0 && (
          <div className="border-t border-blush-100/10">
            <nav className="container flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-5 text-xs text-blush-100/70 sm:justify-start">
              {policies.map((p) => (
                <Link
                  key={p.id}
                  href={`/policies/${p.slug}`}
                  className="transition-colors hover:text-dustyrose"
                >
                  {p.title}
                </Link>
              ))}
            </nav>
          </div>
        )}

        <div className="border-t border-blush-100/10">
          <div className="container flex flex-col items-center justify-between gap-3 py-6 text-xs text-blush-100/60 sm:flex-row">
            <p>© {new Date().getFullYear()} {settings.branding.copyright}</p>
            <p className="flex items-center gap-1.5">
              Baked with <span className="text-wine">♥</span> & zero eggs
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
