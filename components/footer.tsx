"use client";

import Link from "next/link";
import { Instagram, Facebook, Music2, Mail, MapPin, Phone } from "lucide-react";
import { CardCarousel } from "@/components/ui/card-carousel";
import { LogoMark } from "@/components/logo-mark";
import { useSiteSettings } from "@/lib/use-site-settings";
import { usePolicies } from "@/lib/use-policies";
import { policyHref, PRIVACY_POLICY_HREF, PRIVACY_POLICY_SLUG } from "@/lib/policies";
import { instagramUrl, instagramHandle } from "@/lib/site-settings";

// There is deliberately NO fallback image set here any more.
//
// This section is headed "Follow the sweetness — @handle, fresh bakes daily on
// Instagram", so whatever it shows is presented as the bakery's own Instagram
// content. It used to fall back to eight Unsplash stock photos, which meant:
//   • stock images were passed off as the bakery's bakes, and
//   • one of those Unsplash URLs had rotted, so every page load fired a 404
//     (the settings hook starts from defaults, so the fallback rendered in the
//     server HTML of EVERY page before hydration swapped in the real reels).
//
// The section now renders only when the admin has configured at least one
// active Reel. With none, it is omitted entirely — an absent section is
// honest, a fake one is not.

/**
 * Alt text for a reel slide: the admin's caption when there is one, otherwise a
 * neutral label so a screen reader still gets something meaningful.
 *
 * No cleverness here on purpose. An earlier version tried to detect "looks like
 * keyboard mash" and suppress it, but nothing separates a test entry from a
 * genuinely short caption reliably — and silently blanking the owner's real
 * caption is worse than showing an odd one. Placeholder captions are the
 * owner's to fix in the admin panel.
 */
function reelAlt(title: string | null | undefined, index: number): string {
  const t = (title ?? "").trim();
  return t !== "" ? t : `Instagram reel ${index + 1}`;
}

// Shown when the matching site_settings field is empty, so the footer never
// looks blank. Phone is intentionally NOT defaulted — it comes solely from
// the DB and its row is hidden when unset (no hardcoded number anywhere).
const FALLBACK = {
  address: "14 Honey Lane, London, E1 6AN",
  email: "hello@lerasabakery.com",
};

// The Privacy Policy is the one policy that is NOT admin-managed: it's a legal
// document for Le Rasa, hand-written at /privacy-policy (see
// lib/privacy-policy.ts). policyHref() encodes that exception once, and every
// policy link on the site goes through it.

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

  // Reels gallery: each slide is an active Reel's admin-uploaded cover image,
  // linking out to that reel. No active reels → `galleryImages` is empty and the
  // whole section is skipped (see the note by the removed fallback set above).
  const reels = (settings.instagram_reels ?? []).filter((r) => r.active && r.url);
  const galleryImages = reels.map((r, i) => ({
    src: r.cover_image || "/reel-fallback.svg",
    // A reel whose title is blank (or is leftover keyboard-mash) must not
    // become the alt text a screen reader reads out — fall back to a neutral,
    // production-appropriate label.
    alt: reelAlt(r.title, i),
    href: r.url,
  }));
  const hasGallery = galleryImages.length > 0;

  // Policy bar links, in the admin's order. The privacy entry is redirected to
  // its own page, and appended when the policies table has no privacy row at
  // all — /privacy-policy exists in code, so it must always be reachable.
  const policyLinks: { key: string; href: string; label: string }[] = policies.map((p) => ({
    key: p.id,
    href: policyHref(p.slug),
    label: p.title,
  }));
  if (!policies.some((p) => p.slug === PRIVACY_POLICY_SLUG)) {
    policyLinks.push({
      key: PRIVACY_POLICY_SLUG,
      href: PRIVACY_POLICY_HREF,
      label: "Privacy Policy",
    });
  }

  // Only render social icons whose URL is configured.
  const socials = [
    { Icon: Instagram, href: igUrl },
    { Icon: Facebook, href: settings.facebook_url.trim() },
    { Icon: Music2, href: settings.tiktok_url.trim() },
  ].filter((s) => s.href !== "");

  return (
    <footer className="relative mt-10">
      {/* Instagram carousel — Swiper coverflow. Rendered ONLY when the admin has
          active Reels, so the site never presents stock imagery as its own
          Instagram feed. Styling and layout are untouched. */}
      {hasGallery && (
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

          {/* Carousel — the admin's Instagram reel thumbnails. Same coverflow
              animation and layout as before. */}
          <CardCarousel
            images={galleryImages}
            autoplayDelay={2000}
            showPagination={true}
            showNavigation={false}
            unoptimized
          />
        </div>
      </section>
      )}

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
                    className="tap-target grid h-10 w-10 place-items-center rounded-full bg-blush-100/10 text-blush-50 transition-colors hover:bg-wine"
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
              Open Mon–Sat · 9am – 7pm
            </p>
          </div>
        </div>

        {/* Policy links — order and labels come from the admin panel (the
            policies table), with the one exception built in policyLinks above:
            Privacy Policy always appears and always points at /privacy-policy. */}
        {policyLinks.length > 0 && (
          <div className="border-t border-blush-100/10">
            <nav className="container flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-5 text-xs text-blush-100/70 sm:justify-start">
              {policyLinks.map((l) => (
                <Link
                  key={l.key}
                  href={l.href}
                  className="transition-colors hover:text-dustyrose"
                >
                  {l.label}
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
