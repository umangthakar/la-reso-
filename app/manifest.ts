// ============================================================
// /manifest.webmanifest  (Next.js Metadata Route)
// ------------------------------------------------------------
// The PWA / "add to home screen" manifest. Name, short name and description
// come from the SAME admin Branding Settings (site_settings.branding) that
// feed every page's <title> and Open Graph tags, so a brand rename stays
// consistent everywhere with no code change.
//
// Icons point at the app-router icon files (app/icon.png, app/apple-icon.png),
// which Next serves at stable /icon.png and /apple-icon.png URLs.
// Colours are the Le Rasa palette from tailwind.config.ts — blush background,
// wine theme — so the splash screen matches the site.
// ============================================================

import type { MetadataRoute } from "next";
import { getPublicSettings } from "@/lib/site-settings-server";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { branding } = await getPublicSettings();

  return {
    name: `${branding.name} — ${branding.tagline}`,
    short_name: branding.short_name || branding.name,
    description: branding.description,
    start_url: "/",
    display: "standalone",
    background_color: "#F9EEEA", // blush.100
    theme_color: "#873853", // wine.DEFAULT
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
