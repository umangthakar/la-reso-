// ============================================================
// Le Rasa Bakery — hero slider images (shared, client + server safe)
//
// Types, constants and normalisation for the hero_slider_images table, plus
// the pure logic that turns those rows into the home hero's three cakes (see
// THE STOREFRONT SLIDES at the bottom).
// Pure (one import — the slug rules — and no side effects) so the admin page,
// the API routes and the storefront reader (lib/hero-slider-server.ts) all
// agree on one shape.
//
// Schema: supabase/sql/36_hero_slider.sql + 37_hero_slider_product.sql
// ============================================================

import { productHref } from "@/lib/slug";

/**
 * The linked product, as joined onto a hero row.
 *
 * A VIEW of the products table, never a copy of it: these fields are read
 * through the foreign key on every request and stored nowhere in this module's
 * table (see 37_hero_slider_product.sql). Renaming or re-photographing a
 * product changes what the hero shows with nothing to migrate.
 *
 * `name` is the only field the storefront needs — the detail-page URL is
 * derived from it (lib/slug.ts). The rest exist for the admin's picker, which
 * has to show the admin enough to recognise the cake they mean.
 */
export type HeroSliderProduct = {
  id: string;
  name: string;
  /** Catalogue photo, for the admin picker's thumbnail. Null when unset. */
  image_url: string | null;
  category: string | null;
  price: number | null;
  /** Whether the product is on the storefront. A hero image linked to a hidden
   *  product still lists in the admin, flagged — see the picker. */
  visible: boolean;
};

/** One row of hero_slider_images, as every caller sees it. */
export type HeroSliderImage = {
  id: string;
  /** Public URL of the uploaded PNG (Supabase Storage). */
  image_url: string;
  /** Admin drag-to-reorder position, ascending. */
  display_order: number;
  /** Admin on/off switch. Hidden images stay in the list, out of the hero. */
  visible: boolean;
  /** products.id this image advertises, or null when nothing is linked yet.
   *  Nullable because the column was added to a table that already had rows —
   *  the upload form requires it, the database cannot. */
  product_id: string | null;
  /** The joined product, when the caller asked for the embed AND the row is
   *  linked to a product the reader is allowed to see. Null otherwise, which
   *  a caller must treat as "no product" rather than "not fetched" — the two
   *  are the same thing to everything downstream. */
  product: HeroSliderProduct | null;
  created_at: string;
  updated_at: string;
};

/** Columns fed to the Supabase select. Explicit rather than `*` so adding a
 *  column later can't silently widen what the API returns. */
export const HERO_SLIDER_COLS =
  "id,image_url,display_order,visible,product_id,created_at,updated_at";

// ------------------------------------------------------------
// The product embed
// ------------------------------------------------------------
// PostgREST resolves `product:products(...)` through the foreign key added in
// 37_hero_slider_product.sql, so the join is one request rather than a second
// round trip per row — and it is evaluated under the PRODUCTS table's RLS,
// which is what makes the public embed safe to ask for.
//
// Two shapes, because the two readers need different things and neither should
// pay for the other's columns:
//
//   PUBLIC  the name only. It is all the storefront does with a product —
//           turn it into /menu/<slug> — and asking for price or stock on a
//           page that never shows them would be sending the visitor data for
//           nothing.
//   ADMIN   enough to recognise a cake in the list and the picker: thumbnail,
//           category, price, and whether it is still on the storefront.

/** Storefront select: hero row + just enough product to build its link. */
export const HERO_SLIDER_PUBLIC_SELECT = `${HERO_SLIDER_COLS},product:products(id,name)`;

/** Admin select: hero row + the product as the picker renders it. */
export const HERO_SLIDER_ADMIN_SELECT = `${HERO_SLIDER_COLS},product:products(id,name,image_url,category,price,visible)`;

// ------------------------------------------------------------
// Storage
// ------------------------------------------------------------
// Hero PNGs live under a prefix inside the EXISTING public site-assets bucket
// — no new bucket. These two constants are the single source of truth for
// where a hero image is written and where it is deleted from, so the upload
// route and any cleanup can never drift apart. See section 5 of the migration
// for why the "folder" needs no creation step.

/** The existing public bucket hero images share with the other site assets. */
export const HERO_SLIDER_BUCKET = "site-assets";

/** Path prefix (the "folder") every hero image is stored under. */
export const HERO_SLIDER_FOLDER = "hero-slider";

/** Storage key for a hero image file, e.g. `hero-slider/hero-<uuid>.png`. */
export function heroSliderPath(filename: string): string {
  return `${HERO_SLIDER_FOLDER}/${filename}`;
}

/**
 * A unique filename for a newly uploaded hero image.
 *
 * A v4 UUID rather than the admin's original filename: two people uploading
 * their own "hero.png" must not collide, and the upload itself is made with
 * `upsert: false`, so a collision would be a hard failure rather than a silent
 * overwrite. The `hero-` prefix keeps the objects recognisable when browsing
 * the bucket by hand.
 *
 * `crypto.randomUUID` is available in both runtimes this is called from
 * (Node 18+ and every browser that can run the admin panel).
 */
export function newHeroSliderFilename(): string {
  return `hero-${crypto.randomUUID()}.png`;
}

// ============================================================
// VALIDATION
// ------------------------------------------------------------
// The rules live here, once, and BOTH sides run them: the admin page checks a
// file before a byte leaves the browser (so an invalid pick fails instantly
// and costs no bandwidth), and the upload route checks the bytes again before
// touching storage (because a client-side check is a convenience, never a
// guarantee — the endpoint is reachable without the page).
//
// Sharing the implementation is the point: two copies of "at least 400px"
// would eventually disagree, and the one that mattered would be whichever the
// caller happened to hit.
// ============================================================

/** Hard ceiling on an uploaded file. */
export const HERO_SLIDER_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** Minimum width AND height. A hero image smaller than this is upscaled into
 *  a blur on any real screen. */
export const HERO_SLIDER_MIN_DIMENSION = 400;

/**
 * Upper bound on the PIXEL count, which is a different limit from the 10 MB
 * one above and not implied by it: PNG compresses flat artwork extremely well,
 * so a small file can still declare an enormous canvas.
 *
 * It matters because the server verifies an upload by decompressing its pixel
 * data (lib/png-integrity.ts), and that work scales with pixels, not with file
 * size. 40 MP is 8000×5000 — far beyond anything a hero slide needs, and well
 * past what a browser would happily render.
 */
export const HERO_SLIDER_MAX_PIXELS = 40_000_000;

/** Every rejection message, in the admin's words rather than the machine's. */
export const HERO_SLIDER_ERRORS = {
  notPng: "Only PNG images are allowed for the Hero Slider.",
  tooLarge: `That image is too large. The maximum size is ${HERO_SLIDER_MAX_BYTES / (1024 * 1024)} MB.`,
  unreadable: "That file could not be read as a PNG image — it may be corrupted.",
  tooSmall: `That image is too small. Hero images must be at least ${HERO_SLIDER_MIN_DIMENSION}×${HERO_SLIDER_MIN_DIMENSION} pixels.`,
  tooManyPixels: `That image has too many pixels. Please export it at ${HERO_SLIDER_MAX_PIXELS / 1_000_000} megapixels or fewer.`,
  empty: "That file is empty.",
} as const;

/** The 8-byte PNG signature every valid PNG opens with. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** True when the name ends in .png (case-insensitive).
 *
 *  Checked alongside the MIME type, not instead of it: a browser can report an
 *  empty or wrong `type` for a file dragged from some sources, and an
 *  extension can be renamed freely. Neither is trusted on its own — the byte
 *  signature below is what actually decides, on the server. */
export function isPngFilename(name: string): boolean {
  return /\.png$/i.test((name ?? "").trim());
}

/** True when the bytes actually open with the PNG signature. */
export function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/**
 * Width and height straight out of the PNG header, or null if the bytes are
 * not a PNG whose header can be read.
 *
 * The spec fixes this layout, so no decoder is needed: an 8-byte signature,
 * then the IHDR chunk — 4-byte length, the 4-byte type "IHDR", then width and
 * height as big-endian uint32s. Reading it directly means the dimension check
 * is one implementation running identically in the browser and on the server,
 * with nothing to install on either side.
 *
 * This validates the HEADER only. Bytes past it can still be truncated or
 * corrupt, which is what the server's full decode catches (see the upload
 * route) — this call cannot and does not claim otherwise.
 */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  // 8 signature + 4 length + 4 type + 4 width + 4 height
  if (bytes.length < 24 || !hasPngSignature(bytes)) return null;
  const ihdr = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (ihdr !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/**
 * Run every rule that can be decided from the bytes. Returns the message to
 * show, or null when the file passes.
 *
 * Ordered cheapest-and-most-specific first, so the admin gets the one reason
 * that actually explains their file: "not a PNG" before "too small", never a
 * dimension complaint about a JPEG.
 */
export function validateHeroSliderBytes(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return HERO_SLIDER_ERRORS.empty;
  if (bytes.length > HERO_SLIDER_MAX_BYTES) return HERO_SLIDER_ERRORS.tooLarge;
  if (!hasPngSignature(bytes)) return HERO_SLIDER_ERRORS.notPng;
  const size = readPngSize(bytes);
  if (!size) return HERO_SLIDER_ERRORS.unreadable;
  if (size.width < HERO_SLIDER_MIN_DIMENSION || size.height < HERO_SLIDER_MIN_DIMENSION) {
    return HERO_SLIDER_ERRORS.tooSmall;
  }
  if (size.width * size.height > HERO_SLIDER_MAX_PIXELS) {
    return HERO_SLIDER_ERRORS.tooManyPixels;
  }
  return null;
}

/**
 * The storage key to delete for a stored image, or null when this row's URL
 * does not point at a hero image in our own bucket.
 *
 * Deriving it from the URL rather than storing a path column keeps one source
 * of truth per row, but it means a delete is only ever as safe as this
 * function — so it is deliberately strict. It requires the Supabase public
 * object prefix, the exact bucket, AND the hero-slider/ folder, and returns
 * null for anything else (an external URL, a hand-edited row, an object
 * elsewhere in the shared site-assets bucket). Null means "there is no hero
 * file of ours here", which callers must treat as nothing to delete — never as
 * a licence to guess.
 *
 * That strictness is the point: site-assets is SHARED with the logo, the about
 * image and every rotating-banner image. A looser parse that fell back to "the
 * last path segment" could hand a delete the key of an image another part of
 * the admin panel owns.
 */
export function heroSliderStoragePath(imageUrl: string): string | null {
  const url = (imageUrl ?? "").trim();
  if (!url) return null;
  const marker = `/storage/v1/object/public/${HERO_SLIDER_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  // Drop any ?query / #fragment before using the remainder as a key.
  const key = decodeURIComponent(url.slice(at + marker.length).split(/[?#]/)[0]);
  if (!key.startsWith(`${HERO_SLIDER_FOLDER}/`)) return null;
  // No traversal, and a real filename after the prefix.
  if (key.includes("..") || key.length <= HERO_SLIDER_FOLDER.length + 1) return null;
  return key;
}

/**
 * Renumber a list to 0..n-1 in its current array order, so positions are
 * always contiguous with no gaps — what the list looks like after a drop, and
 * what it must look like again after a delete.
 */
export function resequenceHeroSliderImages(images: HeroSliderImage[]): HeroSliderImage[] {
  return images.map((image, index) => ({ ...image, display_order: index }));
}

/**
 * The filename shown in the admin table's Image column.
 *
 * Derived from the URL rather than stored: the row records where the image
 * lives, and the name is just the tail of that. Falls back to the whole URL
 * when it doesn't parse (a hand-entered value, say), so the column always
 * shows something the admin can recognise the image by.
 */
export function heroSliderFilename(imageUrl: string): string {
  const url = (imageUrl ?? "").trim();
  if (!url) return "";
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.split("/").filter(Boolean).pop() ?? url);
  } catch {
    return url.split("/").filter(Boolean).pop() ?? url;
  }
}

/**
 * Coerce the embedded product into a HeroSliderProduct, or null.
 *
 * Null is the answer for every "there isn't one" case, and they are
 * deliberately not distinguished: the row is unlinked, the caller didn't ask
 * for the embed, the product was deleted, or RLS hid it from an anon read. All
 * four mean the same thing to a caller — no product to link to — and a code
 * that told them apart would only invite handling that cannot be acted on.
 *
 * PostgREST returns a to-one embed as an object, but a hand-rolled query (or a
 * schema cache that hasn't reloaded) can produce a single-element array, so
 * both are accepted.
 */
function normaliseHeroSliderProduct(raw: unknown): HeroSliderProduct | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  const id = typeof p.id === "string" ? p.id : "";
  const name = typeof p.name === "string" ? p.name : "";
  // A product with no id is not addressable and one with no name has no URL —
  // either way there is nothing usable to hand on.
  if (!id || !name) return null;
  const price = Number(p.price);
  return {
    id,
    name,
    image_url: typeof p.image_url === "string" && p.image_url ? p.image_url : null,
    category: typeof p.category === "string" && p.category ? p.category : null,
    price: Number.isFinite(price) ? price : null,
    // The public embed doesn't select `visible` (an anon read only ever sees
    // visible products anyway), so a missing column means visible.
    visible: p.visible !== false,
  };
}

/** Coerce an unknown row into a fully-populated HeroSliderImage, so a partial
 *  or legacy row can never reach the UI with undefined fields. */
export function normaliseHeroSliderImage(raw: unknown): HeroSliderImage {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const product = normaliseHeroSliderProduct(r.product);
  return {
    id: str(r.id),
    image_url: str(r.image_url),
    display_order: typeof r.display_order === "number" ? r.display_order : 0,
    // Only an explicit false hides an image — anything else (including a
    // missing column) is visible, matching the column's DB default.
    visible: r.visible !== false,
    // The embed wins when it is present: it is the row the foreign key
    // ACTUALLY resolves to, so a product_id left pointing at a deleted row
    // (possible only if the FK were ever dropped) can't outvote it.
    product_id: product ? product.id : str(r.product_id) || null,
    product,
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
  };
}

/** Order a list the way both the admin table and the storefront read it:
 *  display_order ascending, created_at breaking ties so rows sharing an order
 *  (all 0 before the first drag) never shuffle between loads. */
export function sortHeroSliderImages(images: HeroSliderImage[]): HeroSliderImage[] {
  return [...images].sort(
    (a, b) => a.display_order - b.display_order || a.created_at.localeCompare(b.created_at),
  );
}

// ============================================================
// THE STOREFRONT SLIDES
// ------------------------------------------------------------
// What the home hero rotates through: every usable image URL, in the admin's
// order. Pure, so the reader (lib/hero-slider-server.ts) only has to fetch —
// the choosing, the validating and the falling back all happen here, where
// they can be reasoned about without a database.
//
// THE WHOLE LIST, NOT THE FIRST THREE. The hero shows three cakes but rotates
// through all of them: lib/hero-carousel.ts slides a three-slot window over
// this array, so truncating here would be deleting the rest of the carousel.
// Three is a rendering limit, and it is enforced where the rendering happens.
// ============================================================

/**
 * What next/image is allowed to load, i.e. the `remotePatterns` in
 * next.config.mjs, one entry each. MIRRORED, not imported: next.config.mjs is
 * plain ESM loaded by the Next CLI and cannot import a TypeScript module, so
 * the two lists are kept in step by this comment. Adding a pattern there means
 * adding it here.
 *
 * `prefix` mirrors that entry's `pathname`, because a pattern is host AND path:
 * the Supabase entry only covers /storage/v1/object/public/**, so a URL on the
 * right host but the wrong path is still one next/image refuses.
 *
 * The Supabase host comes from the same env var next.config.mjs derives it
 * from, read at CALL TIME rather than at module load — a top-level read would
 * bake the build machine's value into the bundle.
 */
function optimisablePatterns(): { host: string; prefix: string }[] {
  const patterns = [
    { host: "images.unsplash.com", prefix: "/" },
    { host: "plus.unsplash.com", prefix: "/" },
  ];
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
    patterns.push({ host, prefix: "/storage/v1/object/public/" });
  } catch {
    // No/invalid Supabase URL configured — the two Unsplash hosts still stand.
  }
  return patterns;
}

/**
 * True when next/image can actually render this src.
 *
 * This guard is the difference between a bad row and a 500. `<Image>` THROWS on
 * a src it can't resolve — a relative string, an unknown protocol, a host
 * outside remotePatterns — and a throw inside the hero takes the whole home
 * page with it. Every URL here comes from a database row, which the admin
 * upload writes correctly but which can also be hand-edited in the Supabase
 * table editor, so it is not trusted.
 *
 * Site-relative paths (`/images/…`) pass: they're served by this app, and
 * next/image needs no allow-list for them.
 */
export function isRenderableHeroImageUrl(url: string): boolean {
  const src = (url ?? "").trim();
  if (!src) return false;
  if (src.startsWith("//")) return false; // protocol-relative — next/image rejects
  if (src.startsWith("/")) return true; // served by this app
  try {
    const parsed = new URL(src);
    // https only, matching every remotePattern's `protocol`. An http:// URL on
    // an allowed host is still one next/image throws on.
    if (parsed.protocol !== "https:") return false;
    return optimisablePatterns().some(
      (p) => p.host === parsed.hostname && parsed.pathname.startsWith(p.prefix),
    );
  } catch {
    return false;
  }
}

/**
 * One cake on the hero: the photo, and where clicking Order Now takes you.
 *
 * `href` is null when the slide advertises nothing — an image the admin has
 * not linked yet, one whose product has since been deleted or hidden, or a
 * fallback image from site_settings.home_slider, which has no product to link
 * to by construction. The hero treats null as "send them to the menu", so a
 * missing link is a weaker call to action rather than a dead button.
 */
export type HeroSlide = {
  /** Public URL of the PNG, already checked against next/image's allow-list. */
  src: string;
  /** Product detail URL, or null when this slide has no product behind it. */
  href: string | null;
};

/**
 * The hero's slides: every visible Hero Slider image, in the admin's order —
 * falling back to `fallback` when that list has nothing usable in it.
 *
 * FALLBACK, NOT A DEFAULT. The Hero Slider table is the source of truth for
 * the hero; `fallback` is what keeps the composition whole in the three cases
 * where the table can't answer — nothing uploaded yet, every image hidden, or
 * the database unreachable (the reader turns that into an empty list). The
 * caller supplies it, so the choice of what to show instead stays a page-level
 * decision rather than something buried in here.
 *
 * Both lists are filtered, so an unrenderable URL on either side is skipped
 * instead of thrown, and a table holding one good row and one bad one still
 * shows the good one rather than dropping to the fallback.
 *
 * THE LINK IS DERIVED, NOT STORED. Each slide's href comes from the JOINED
 * product's name, run through the same slug rules the detail page resolves with
 * (lib/slug.ts). Nothing about the route is written here, and nothing about the
 * product is cached — rename a cake and the hero links to its new URL on the
 * next request.
 */
export function heroSlidesFrom(images: HeroSliderImage[], fallback: string[] = []): HeroSlide[] {
  const slides = sortHeroSliderImages(images)
    .filter((image) => image.visible && isRenderableHeroImageUrl(image.image_url))
    .map((image) => ({
      src: image.image_url,
      href: productHref(image.product?.name),
    }));
  if (slides.length > 0) return slides;
  // The fallback is a bare list of URLs (site_settings.home_slider), so there
  // is no product behind any of it — every one of these opens the menu.
  return (fallback ?? [])
    .filter(isRenderableHeroImageUrl)
    .map((src) => ({ src, href: null }));
}
