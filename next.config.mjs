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
};

export default nextConfig;
