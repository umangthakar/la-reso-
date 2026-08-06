// Derive the Supabase Storage hostname from the project URL so the
// next/image allow-list can never drift from the actual project again.
// Falls back to the current project ref if the env var is unset at build.
const SUPABASE_HOSTNAME = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
  } catch {
    return "fessgqsjotvovzeqooza.supabase.co";
  }
})();

// ------------------------------------------------------------
// Security response headers.
//
// The site previously sent NONE of these, so every page was served without
// clickjacking, MIME-sniffing or referrer protection. Each entry below is a
// transport-level hardening header only — nothing here can change a layout, a
// colour, a font or an animation, and none of them restrict what the page may
// load. Content-Security-Policy is DELIBERATELY ABSENT: this app inlines
// styles and embeds Stripe, Supabase and Instagram, so a CSP needs its own
// tested rollout rather than being switched on blind.
//
// Applied to every route via the `/:path*` source, including API routes.
// ------------------------------------------------------------
const SECURITY_HEADERS = [
  // Never let a browser second-guess a declared Content-Type. Stops a file
  // uploaded through the admin panel being sniffed into something executable.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No third-party site may frame us — the clickjacking defence for the admin
  // panel and the checkout. We embed Stripe's iframe, which is unaffected:
  // this governs OUR pages being framed, not what we may embed.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Send the full URL only to ourselves; cross-origin requests get the origin
  // alone, so an order-confirmation or reset-password URL never leaks its path
  // to an external host in a Referer header.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // We ask for none of these, so deny them outright rather than leaving the
  // browser defaults in place.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // HTTPS-only from the first response, for two years, subdomains included.
  // Safe on Vercel (TLS everywhere); harmless locally, where plain http on
  // localhost is exempt from HSTS by specification.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Drop `X-Powered-By: Next.js` — free framework/version disclosure on every
  // single response, and nothing reads it.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // Disable the App Router client-side Router Cache so navigating back to a
  // page always refetches fresh data (admin edits show up without a redeploy).
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
      },
      {
        // Supabase Storage — product images uploaded via the admin panel
        protocol: "https",
        hostname: SUPABASE_HOSTNAME,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async redirects() {
    return [
      {
        // ONE canonical Privacy Policy. The admin-managed `policies` row is
        // deliberately kept (the footer and /policies still list it), but its
        // public page must never serve a second, divergent privacy document —
        // so the old URL permanently redirects to the hand-written Termly page.
        //
        // 301 rather than `permanent: true` (which emits 308) because that is
        // what was specified; both are permanent and equivalent to search
        // engines. This preserves existing indexed URLs and old bookmarks.
        //
        // Links across the site point straight at /privacy-policy via
        // policyHref(), so this redirect is the safety net, not the mechanism.
        source: "/policies/privacy-policy",
        destination: "/privacy-policy",
        statusCode: 301,
      },
      {
        // The Cookie Policy briefly lived at /cookie-policy before moving under
        // /policies/ with its siblings. Permanent (308) so the old URL, any
        // bookmarks, and the two Cookie Notice links inside the Privacy Notice
        // all resolve to the one canonical page instead of 404ing.
        source: "/cookie-policy",
        destination: "/policies/cookie-policy",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
