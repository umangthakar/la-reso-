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
        hostname: "mslzcupzkzzlqlygaisv.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
