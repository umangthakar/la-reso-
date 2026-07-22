import type { Metadata } from "next";
import { Suspense } from "react";
import { Fraunces, Nunito } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { AnnouncementBar } from "@/components/announcement-bar";
import { ConditionalFooter } from "@/components/conditional-footer";
import { Providers } from "@/components/providers";
import { getPublicSettings } from "@/lib/site-settings-server";

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
    title,
    description: branding.description,
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
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${nunito.variable}`}>
      <head>
        <link rel="preload" as="video" type="video/mp4" href="/hero-animation.mp4" />
      </head>
      <body>
        {/* Site-wide announcement bar. Fetches its own (no-store) data and
            renders nothing unless enabled in admin. Isolated in Suspense so a
            slow/failing lookup can never block the splash screen on "/". */}
        <Suspense fallback={null}>
          <AnnouncementBar />
        </Suspense>
        <Providers>
          <Navbar />
          <main className="overflow-x-clip">{children}</main>
          <ConditionalFooter />
        </Providers>
      </body>
    </html>
  );
}
