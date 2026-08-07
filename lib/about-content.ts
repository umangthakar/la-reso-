// ============================================================
// Le Rasa Bakery — About Us page content (shared, client + server safe)
//
// Types, defaults, normalisation and storage rules for site_settings.about_page
// — the CMS behind /about. Pure (two imports, no side effects) so the admin
// page, the API route and the storefront all agree on one shape and one set of
// rules, exactly as lib/hero-slider.ts does for the hero module.
//
// Schema: supabase/sql/47_about_page.sql
//
// THE DEFAULTS ARE THE PAGE. Every field below holds the copy that was
// hardcoded in app/about/page.tsx before this module existed, so an unmigrated
// database, an empty column or a half-written object all render exactly the
// page that shipped. The admin overrides fields one at a time; nothing has to
// be filled in for the site to be correct.
// ============================================================

// The storefront renders the photo through next/image, which THROWS on a src it
// cannot resolve. That allow-list check is not hero-specific — it mirrors
// next.config.mjs's remotePatterns — so it is imported rather than copied. One
// implementation means one thing to update when a pattern is added.
import { isRenderableHeroImageUrl } from "@/lib/hero-slider";
import { cleanString, cleanText } from "@/lib/input-validation";

/** Everything the /about page renders that an admin can change. */
export type AboutContent = {
  /** Pill above the top hero heading, e.g. "Our Story". */
  hero_eyebrow: string;
  /** The <h1>. */
  hero_heading: string;
  /** The paragraph under the <h1>. */
  hero_description: string;
  /** Small badge above the story heading, e.g. "Est. with love". */
  badge: string;
  /** The story section's <h2>. */
  heading: string;
  /** Story body, one entry per rendered <p>. Up to {@link MAX_PARAGRAPHS};
   *  blanks are dropped, so an admin can publish one or two instead of three. */
  paragraphs: string[];
  /** Public URL of the story photo. */
  image_url: string;
  /** Alt text for that photo. Editable because the photo is: alt text written
   *  for one image is wrong for the next one. */
  image_alt: string;
};

/** The story section renders exactly this many paragraph slots. Fixed so the
 *  page's composition can't be changed from the admin panel — this is a CMS
 *  for the copy, not for the layout. */
export const MAX_PARAGRAPHS = 3;

// ------------------------------------------------------------
// Field length caps
// ------------------------------------------------------------
// Enforced on BOTH sides: the admin form counts against them so the limit is
// visible while typing, and the API applies them again to an untrusted body.
// They exist to protect the LAYOUT, not the database — a 400-character heading
// would break a composition this brief explicitly says not to redesign.

export const ABOUT_LIMITS = {
  hero_eyebrow: 40,
  hero_heading: 120,
  hero_description: 400,
  badge: 40,
  heading: 120,
  paragraph: 1200,
  image_alt: 160,
} as const;

/** The copy the /about page shipped with, and its fallback for every field. */
export const ABOUT_DEFAULT: AboutContent = {
  hero_eyebrow: "Our Story",
  hero_heading: "Born from a simple wish — cake for all",
  hero_description:
    "Le Rasa began in a tiny home kitchen with one stubborn belief: no one should sit out the celebration because of an egg.",
  badge: "Est. with love",
  heading: "From one home oven to a house of desserts",
  paragraphs: [
    "It started when our founder, Dhruti, kept getting asked the same question at family gatherings: “Is there anything I can actually eat?” Vegetarian relatives, friends with egg allergies, little ones — too many people were left watching others enjoy dessert.",
    "So she set out to prove that eggless could be every bit as soft, rich and indulgent as the classics. After hundreds of test bakes, the recipes were undeniable. Word spread, the orders poured in, and Le Rasa was born.",
    "Today our team of pastry artisans bakes thousands of celebrations a year — and every single one is still 100% eggless, still made by hand, still rooted in that first simple wish: cake for all.",
  ],
  // The photo the page has always used. On the already-allow-listed Unsplash
  // host, so it renders through next/image untouched until the admin uploads
  // their own.
  image_url:
    "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=900&q=80",
  image_alt: "Baker decorating a cake",
};

// ============================================================
// STORAGE
// ------------------------------------------------------------
// About photos live under a prefix inside the EXISTING public site-assets
// bucket — no new bucket, and no second upload path: the bytes go through
// /api/admin/site-assets/upload like every other admin image. These constants
// are the single source of truth for where an about photo is written and where
// it is deleted from.
// ============================================================

/** The existing public bucket about photos share with the other site assets. */
export const ABOUT_IMAGE_BUCKET = "site-assets";

/** Path prefix (the "folder") every about photo is stored under. */
export const ABOUT_IMAGE_FOLDER = "about";

/** Hard ceiling on an uploaded about photo. */
export const ABOUT_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** Accepted upload types. A subset of what lib/upload-validation.ts allows, so
 *  sending it to the server can only ever NARROW that endpoint's policy. */
export const ABOUT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** The photo's frame on the page — 4:5 portrait. Mirrored in the admin preview
 *  so what the admin crops for is what the page shows. */
export const ABOUT_IMAGE_ASPECT = "4 / 5";

/** Recommended source size for that frame. */
export const ABOUT_IMAGE_RECOMMENDED = { width: 900, height: 1125 } as const;

/** True when next/image can actually render this src. See the import note at
 *  the top of the file — the rule is next.config.mjs's, not the hero's. */
export const isRenderableAboutImageUrl = isRenderableHeroImageUrl;

/**
 * The storage key to delete for a stored about photo, or null when this URL
 * does not point at an about photo in our own bucket.
 *
 * Deliberately strict, for the same reason heroSliderStoragePath is: site-assets
 * is SHARED with the logo, the home slider, policy images and offer artwork. It
 * requires the Supabase public object prefix, the exact bucket AND the `about/`
 * folder, and returns null for anything else — the default Unsplash URL, a
 * hand-edited row, or an object elsewhere in the bucket. Null means "there is no
 * about photo of ours here", which callers must treat as nothing to delete,
 * never as a licence to guess a key.
 */
export function aboutImageStoragePath(imageUrl: string): string | null {
  const url = (imageUrl ?? "").trim();
  if (!url) return null;
  const marker = `/storage/v1/object/public/${ABOUT_IMAGE_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  // Drop any ?query / #fragment before using the remainder as a key.
  const key = decodeURIComponent(url.slice(at + marker.length).split(/[?#]/)[0]);
  if (!key.startsWith(`${ABOUT_IMAGE_FOLDER}/`)) return null;
  // No traversal, and a real filename after the prefix.
  if (key.includes("..") || key.length <= ABOUT_IMAGE_FOLDER.length + 1) return null;
  return key;
}

// ============================================================
// NORMALISATION
// ============================================================

/**
 * Coerce an unknown value into fully-populated AboutContent.
 *
 * FIELD BY FIELD, and every field independently: a row holding only a heading
 * yields that heading plus the default everything-else, so a partial save, a
 * legacy row and a NULL column all produce a complete page. This is the
 * "gracefully fall back to the current default content" guarantee, and it is in
 * one place rather than spread across the JSX.
 *
 * Values are cleaned as well as defaulted (control characters stripped,
 * whitespace collapsed, length capped) so the page can never be handed
 * something that breaks its layout, whatever is in the column.
 */
export function normaliseAboutContent(raw: unknown): AboutContent {
  const a = (raw ?? {}) as Partial<Record<keyof AboutContent, unknown>>;

  const line = (value: unknown, max: number, fallback: string) =>
    cleanString(value, max) || fallback;

  const paragraphs = Array.isArray(a.paragraphs)
    ? a.paragraphs
        .map((p) => cleanText(p, ABOUT_LIMITS.paragraph))
        .filter((p) => p !== "")
        .slice(0, MAX_PARAGRAPHS)
    : [];

  // An image the storefront cannot render is worse than no image at all —
  // next/image throws on it and takes the page with it. Anything unrenderable
  // (an http:// URL, an unknown host, a hand-edited value) falls back to the
  // built-in photo, which is allow-listed by construction.
  const image = cleanString(a.image_url, 2048);

  return {
    hero_eyebrow: line(a.hero_eyebrow, ABOUT_LIMITS.hero_eyebrow, ABOUT_DEFAULT.hero_eyebrow),
    hero_heading: line(a.hero_heading, ABOUT_LIMITS.hero_heading, ABOUT_DEFAULT.hero_heading),
    hero_description: line(
      a.hero_description,
      ABOUT_LIMITS.hero_description,
      ABOUT_DEFAULT.hero_description,
    ),
    badge: line(a.badge, ABOUT_LIMITS.badge, ABOUT_DEFAULT.badge),
    heading: line(a.heading, ABOUT_LIMITS.heading, ABOUT_DEFAULT.heading),
    // An empty list means "nothing saved yet", not "publish an empty story".
    paragraphs: paragraphs.length > 0 ? paragraphs : ABOUT_DEFAULT.paragraphs,
    image_url: isRenderableAboutImageUrl(image) ? image : ABOUT_DEFAULT.image_url,
    image_alt: line(a.image_alt, ABOUT_LIMITS.image_alt, ABOUT_DEFAULT.image_alt),
  };
}

/**
 * The object to WRITE, from an untrusted body.
 *
 * Different from normaliseAboutContent in one deliberate way: a blank field
 * stays blank here instead of picking up the default, so "what is stored" and
 * "what is rendered" remain separate questions. Clearing a heading in the admin
 * therefore means "go back to the built-in wording" — the read path fills it in
 * again on the way out — rather than baking today's default into the row, where
 * it would silently stop tracking the code.
 *
 * The image is the exception: a blank one is stored blank AND read as the
 * built-in photo, which is the same rule, and an unrenderable URL is rejected
 * outright rather than stored for the reader to discard.
 */
export function aboutContentForStorage(raw: unknown): AboutContent {
  const a = (raw ?? {}) as Partial<Record<keyof AboutContent, unknown>>;
  const image = cleanString(a.image_url, 2048);

  return {
    hero_eyebrow: cleanString(a.hero_eyebrow, ABOUT_LIMITS.hero_eyebrow),
    hero_heading: cleanString(a.hero_heading, ABOUT_LIMITS.hero_heading),
    hero_description: cleanString(a.hero_description, ABOUT_LIMITS.hero_description),
    badge: cleanString(a.badge, ABOUT_LIMITS.badge),
    heading: cleanString(a.heading, ABOUT_LIMITS.heading),
    paragraphs: (Array.isArray(a.paragraphs) ? a.paragraphs : [])
      .map((p) => cleanText(p, ABOUT_LIMITS.paragraph))
      .filter((p) => p !== "")
      .slice(0, MAX_PARAGRAPHS),
    image_url: isRenderableAboutImageUrl(image) ? image : "",
    image_alt: cleanString(a.image_alt, ABOUT_LIMITS.image_alt),
  };
}
