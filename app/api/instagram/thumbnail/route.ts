// ============================================================
// Le Rasa Bakery — Instagram Reel thumbnail proxy.
// ------------------------------------------------------------
// Given a public Reel/Post URL (?url=…), resolves its preview image so the
// footer carousel can show real reel thumbnails while the admin only ever
// stores the URLs. Best-effort: Instagram may rate-limit or block datacenter
// IPs, so on any failure we redirect to a bundled placeholder rather than
// erroring — the carousel then still renders and the slide still links out.
//
// Successful lookups are cached in-memory for the lifetime of the serverless
// instance so we don't refetch on every page view.
// ============================================================

import { NextResponse } from "next/server";
import { instagramShortcode } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

// shortcode → resolved image URL (or "" when a lookup failed). Kept small; the
// admin can only configure 10 reels.
const CACHE = new Map<string, { url: string; at: number }>();
const OK_TTL = 6 * 60 * 60 * 1000; // 6h for a hit
const MISS_TTL = 10 * 60 * 1000; // 10m before retrying a miss

const PLACEHOLDER = "/instagram-reel-placeholder.svg";

function extractOgImage(html: string): string {
  // <meta property="og:image" content="…">  (property/content order varies)
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /"display_url"\s*:\s*"([^"]+)"/i,
    /"thumbnail_src"\s*:\s*"([^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].replace(/\\u0026/g, "&").replace(/&amp;/g, "&");
  }
  return "";
}

async function resolveThumbnail(shortcode: string): Promise<string> {
  const cached = CACHE.get(shortcode);
  if (cached && Date.now() - cached.at < (cached.url ? OK_TTL : MISS_TTL)) {
    return cached.url;
  }

  let resolved = "";
  try {
    const res = await fetch(`https://www.instagram.com/reel/${shortcode}/`, {
      headers: {
        // A desktop browser UA makes Instagram more likely to serve the public
        // og:image tags rather than an app redirect.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        Accept: "text/html",
      },
      // Don't hang a page render waiting on Instagram.
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (res.ok) {
      resolved = extractOgImage(await res.text());
    }
  } catch {
    resolved = "";
  }

  CACHE.set(shortcode, { url: resolved, at: Date.now() });
  return resolved;
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  const shortcode = instagramShortcode(url);
  if (!shortcode) {
    return NextResponse.redirect(new URL(PLACEHOLDER, req.url), 302);
  }

  const image = await resolveThumbnail(shortcode);
  if (!image) {
    return NextResponse.redirect(new URL(PLACEHOLDER, req.url), 302);
  }

  // Proxy the actual bytes so the browser never has to hit Instagram's CDN
  // directly (avoids their hotlink/referrer checks) and we control caching.
  try {
    const img = await fetch(image, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!img.ok) throw new Error("image fetch failed");
    const buf = await img.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": img.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=21600",
      },
    });
  } catch {
    return NextResponse.redirect(new URL(PLACEHOLDER, req.url), 302);
  }
}
