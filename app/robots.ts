// ============================================================
// /robots.txt  (Next.js Metadata Route)
// ------------------------------------------------------------
// There was no robots.txt at all, so crawlers had no sitemap hint and
// nothing stopped them indexing the admin panel, a customer's account
// pages or an order-confirmation URL.
//
// Everything public stays crawlable. The disallow list is private or
// per-customer surface only — no product, menu, policy or content page is
// affected.
// ============================================================

import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",          // the whole admin panel
          "/api/",           // no endpoint is a page
          "/account",        // signed-in customer area
          "/auth/",          // verification / reset landing pages
          "/checkout",       // transient, and requires a basket
          "/order-confirmation/", // contains an order id
          "/customize/",     // configurator state, not a landing page
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
