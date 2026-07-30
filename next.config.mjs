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

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
