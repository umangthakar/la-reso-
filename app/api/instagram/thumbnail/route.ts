// ============================================================
// Le Rasa Bakery — Instagram Reel thumbnail proxy.
// ------------------------------------------------------------
// Given a public Reel/Post URL (?url=…), resolves the reel's REAL cover image
// so the footer carousel shows actual thumbnails while the admin only stores
// URLs. Resolution cascade (never scrapes on the client, never exposes a
// secret to the browser):
//
//   1. Instagram oEmbed via the Graph API — reliable, official. Used when
//      INSTAGRAM_OEMBED_TOKEN is set (a Facebook app token "APP_ID|CLIENT_TOKEN"
//      or a user token with the oEmbed Read feature). Server-only env var.
//   2. Server-side metadata extraction — the reel page + its embed page
//      (og:image / EmbeddedMediaImage / display_url). Best-effort; Instagram
//      may block datacenter IPs.
//   3. A tasteful bakery-themed fallback image (never the generic IG glyph).
//
// Resolved covers are proxied (bytes streamed through us, so the browser never
// hits Instagram's CDN) and cached in-memory + via Cache-Control headers.
// ============================================================

import { NextResponse } from "next/server";
import { instagramShortcode } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

// shortcode → resolved cover URL (or "" when every strategy failed).
const CACHE = new Map<string, { url: string; at: number }>();
const OK_TTL = 12 * 60 * 60 * 1000; // 12h for a hit
const MISS_TTL = 15 * 60 * 1000; // 15m before retrying a miss

// Bakery-themed fallback (NOT the "Watch on Instagram" glyph).
const FALLBACK = "/reel-fallback.svg";

function decodeImageUrl(u: string): string {
  return u
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
}

function extractImage(html: string): string {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    // The embed page renders the cover as <img class="EmbeddedMediaImage" src="…">
    /class=["']EmbeddedMediaImage["'][^>]*\ssrc=["']([^"']+)["']/i,
    /<img[^>]+\ssrc=["']([^"']+)["'][^>]*class=["']EmbeddedMediaImage["']/i,
    /"display_url"\s*:\s*"([^"]+)"/i,
    /"thumbnail_src"\s*:\s*"([^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeImageUrl(m[1]);
  }
  return "";
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0 Safari/537.36";

/** 1) Official Instagram oEmbed (Graph API). Requires a server-only token. */
async function viaOEmbed(canonicalUrl: string): Promise<string> {
  const token = process.env.INSTAGRAM_OEMBED_TOKEN;
  if (!token) return "";
  try {
    const api =
      `https://graph.facebook.com/v21.0/instagram_oembed?` +
      `url=${encodeURIComponent(canonicalUrl)}&fields=thumbnail_url&maxwidth=640` +
      `&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(api, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!res.ok) return "";
    const json = (await res.json()) as { thumbnail_url?: string };
    return typeof json.thumbnail_url === "string" ? json.thumbnail_url : "";
  } catch {
    return "";
  }
}

/** 2) Server-side metadata extraction from a page. */
async function scrapePage(pageUrl: string): Promise<string> {
  try {
    const res = await fetch(pageUrl, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return "";
    return extractImage(await res.text());
  } catch {
    return "";
  }
}

async function resolveThumbnail(shortcode: string): Promise<string> {
  const cached = CACHE.get(shortcode);
  if (cached && Date.now() - cached.at < (cached.url ? OK_TTL : MISS_TTL)) {
    return cached.url;
  }

  const canonical = `https://www.instagram.com/reel/${shortcode}/`;

  let resolved = await viaOEmbed(canonical);
  if (!resolved) resolved = await scrapePage(canonical);
  // The embed page is often served without the login wall the reel page shows.
  if (!resolved) resolved = await scrapePage(`${canonical}embed/captioned/`);

  CACHE.set(shortcode, { url: resolved, at: Date.now() });
  return resolved;
}

function fallbackRedirect(req: Request): NextResponse {
  const res = NextResponse.redirect(new URL(FALLBACK, req.url), 302);
  // Cache the miss briefly so we retry (in case oEmbed creds get added later).
  res.headers.set("Cache-Control", "public, max-age=900");
  return res;
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  const shortcode = instagramShortcode(url);
  if (!shortcode) return fallbackRedirect(req);

  const image = await resolveThumbnail(shortcode);
  if (!image) return fallbackRedirect(req);

  // Proxy the bytes so the browser never has to hit Instagram's CDN directly
  // (avoids their hotlink/referrer checks) and we control caching.
  try {
    const img = await fetch(image, {
      headers: { "User-Agent": UA, Accept: "image/*", Referer: "https://www.instagram.com/" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!img.ok) throw new Error("image fetch failed");
    const buf = await img.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": img.headers.get("content-type") ?? "image/jpeg",
        // Cache the real cover hard — reels rarely change their thumbnail.
        "Cache-Control": "public, max-age=43200, stale-while-revalidate=86400",
      },
    });
  } catch {
    return fallbackRedirect(req);
  }
}
