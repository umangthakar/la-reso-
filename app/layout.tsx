import type { Metadata } from "next";
import { Suspense } from "react";
import { Fraunces, Nunito } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { AnnouncementBar } from "@/components/announcement-bar";
import { ConditionalFooter } from "@/components/conditional-footer";

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

export const metadata: Metadata = {
  title: "Le Rasa Bakery — House of Eggless Desserts",
  description:
    "Le Rasa Bakery crafts stunning, 100% eggless cakes, cupcakes, brownies, cookies and gift boxes. Premium desserts everyone can share.",
  keywords: [
    "eggless cakes",
    "eggless bakery",
    "custom cakes",
    "birthday cakes",
    "vegetarian desserts",
    "Le Rasa Bakery",
  ],
  openGraph: {
    title: "Le Rasa Bakery — House of Eggless Desserts",
    description:
      "Premium, 100% eggless cakes & desserts handcrafted for every celebration.",
    type: "website",
  },
};

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
        {/* The announcement bar fetches its own data (site_settings). Isolate it
            in a Suspense boundary so a slow or failing lookup can never block or
            break the rest of the layout — most importantly the splash screen on
            "/", which must paint immediately. */}
        <Suspense fallback={null}>
          <AnnouncementBar />
        </Suspense>
        <Navbar />
        <main className="overflow-x-clip">{children}</main>
        <ConditionalFooter />
      </body>
    </html>
  );
}
