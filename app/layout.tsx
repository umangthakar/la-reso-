import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Fraunces, Nunito } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { AnnouncementBar } from "@/components/announcement-bar";
import { ConditionalFooter } from "@/components/conditional-footer";
import { CookieConsent } from "@/components/cookie-consent";
import { StorefrontOnly } from "@/components/storefront-chrome";
import SiteStructuredData from "@/components/site-structured-data";
import { Providers } from "@/components/providers";
import { getPublicSettings } from "@/lib/site-settings-server";
import { CONSENT_COOKIE_NAME, parseConsent } from "@/lib/cookie-consent";
import { siteUrl } from "@/lib/site-url";

// Never statically cache any route — the announcement bar (and any other
// site_settings-driven chrome) must reflect admin edits without a redeploy.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  weight: ["400", "500", "600", "700", "900"],
});

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

// Metadata is derived from the admin Branding Settings (site_settings.branding)
// so editing the brand name/tagline/description updates every page's <title>,
// description and Open Graph tags with no code change. Falls back to the
// branding defaults when nothing is configured.
export async function generateMetadata(): Promise<Metadata> {
  const { branding } = await getPublicSettings();
  const title = `${branding.name} — ${branding.tagline}`;
  return {
    // metadataBase makes every relative `alternates.canonical` and OG url in
    // the app resolve to an absolute URL. Without it Next emits relative
    // canonicals, which search engines ignore. See lib/site-url for how the
    // base is resolved (set NEXT_PUBLIC_SITE_URL in production).
    metadataBase: new URL(siteUrl()),
    title,
    description: branding.description,
    // Site-wide default canonical. Every page that has its own identity
    // overrides this in its own generateMetadata (see /menu/[slug]).
    alternates: { canonical: "/" },
    keywords: [
      "eggless cakes",
      "eggless bakery",
      "custom cakes",
      "birthday cakes",
      "vegetarian desserts",
      branding.name,
    ],
    openGraph: {
      title,
      description: branding.description,
      type: "website",
      siteName: branding.name,
      url: "/",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: branding.description,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the consent decision on the SERVER so the first paint already knows
  // whether to show the banner. This is what keeps it hydration-safe and stops
  // a returning visitor seeing the banner flash before JS hides it. The layout
  // is already `force-dynamic`, so reading cookies costs nothing extra.
  const consent = parseConsent(cookies().get(CONSENT_COOKIE_NAME)?.value);

  return (
    <html lang="en" className={`${fraunces.variable} ${nunito.variable}`}>
      {/* No <head> preload here.
          It used to carry <link rel="preload" as="video" …>, but "video" is not
          a valid `as` value: every browser logged "<link rel=preload> uses an
          unsupported `as` value" and ignored the hint, so it cost a console
          warning on every page and bought nothing. The splash screen's <video>
          element loads the file itself, which is what actually fetches it. */}
      <body>
        {/* Organization + WebSite + Bakery JSON-LD, emitted ONCE for the whole
            site so no page can produce a duplicate graph. Product and
            BreadcrumbList are per-page and stay in the product route. Isolated
            in Suspense so a slow settings/rating read can't block first paint. */}
        <Suspense fallback={null}>
          <SiteStructuredData />
        </Suspense>
        {/* Every piece of storefront chrome is wrapped in StorefrontOnly, so the
            admin panel no longer inherits the public navigation, cart button,
            "Sign in" link, announcement bar, cookie banner or footer policy
            links. Storefront pages are unaffected. */}
        <StorefrontOnly>
          {/* Site-wide announcement bar. Fetches its own (no-store) data and
              renders nothing unless enabled in admin. Isolated in Suspense so a
              slow/failing lookup can never block the splash screen on "/". */}
          <Suspense fallback={null}>
            <AnnouncementBar />
          </Suspense>
        </StorefrontOnly>
        <Providers>
          <StorefrontOnly>
            <Navbar />
          </StorefrontOnly>
          {/* The one <main> landmark for the document. The admin pages used to
              nest their own <main> inside this one, which is invalid and gives
              assistive tech two competing main regions — they now use plain
              containers and rely on this element. */}
          <main className="overflow-x-clip">{children}</main>
          <StorefrontOnly>
            <ConditionalFooter />
            {/* Its open/closed state comes from the server-read cookie above. */}
            <CookieConsent initialConsent={consent} />
          </StorefrontOnly>
        </Providers>
      </body>
    </html>
  );
}
