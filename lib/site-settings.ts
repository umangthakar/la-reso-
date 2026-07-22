// ============================================================
// Le Rasa Bakery — public site settings (shared, client + server safe)
//
// Types, defaults and normalisation for the site_settings singleton as
// the storefront consumes it. Pure (no imports / side effects) so it can
// be used from client components, the server reader, and API routes.
//
// The actual (server-only) fetch lives in lib/site-settings-server.ts.
// Public fields only — never stripe_config or other secrets.
// ============================================================

export const ALL_DELIVERY_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Announcement = { enabled: boolean; text: string };
export type HeroBanner = { enabled: boolean; heading: string; subtext: string };
export type WhatsappBar = { enabled: boolean; text: string; number: string };
export type BannerType = "hero" | "offer" | "announcement" | "custom_cakes";

// What a banner renders on its right-hand side. Each banner chooses its own,
// independently of the others. Legacy banners have neither field, so
// normaliseBanner() defaults them to "highlight" — the pre-existing behaviour.
export type BannerRightContentType = "highlight" | "image";

export type RotatingBanner = {
  type: BannerType;
  heading: string;
  subtext: string;
  cta_text: string;
  cta_link: string;
  watermark_text: string;
  right_content_type: BannerRightContentType;
  right_image_url: string;
  enabled: boolean;
};

// Emoji shown alongside each banner, derived from its type.
export const BANNER_ICONS: Record<BannerType, string> = {
  hero: "",
  offer: "🎁",
  announcement: "📣",
  custom_cakes: "🎂",
};
// Single source of truth for all contact info across the site.
export type Contact = { phone: string; whatsapp: string; email: string; address: string };
export type About = { text: string; image_url: string };
export type DeliveryZone = {
  id: string;
  name: string;
  postcode_prefix: string;
  fee: number;
};

export type PublicSettings = {
  branding: Branding;
  contact: Contact;
  logo: string;
  instagram_url: string;
  /** Up to 10 Instagram Reels (URL + admin-uploaded cover) powering the footer
   *  "Follow the sweetness" carousel. Empty → the footer falls back to its
   *  static image set. */
  instagram_reels: InstagramReel[];
  facebook_url: string;
  tiktok_url: string;
  announcement: Announcement;
  hero_banner: HeroBanner;
  rotating_banners: RotatingBanner[];
  whatsapp_bar: WhatsappBar;
  about: About;
  home_slider: string[];
  delivery_zones: DeliveryZone[];
  lead_time_days: number;
  blocked_dates: string[];
  delivery_days: string[];
  // Derived from site_settings.stripe_config — safe to expose. The publishable
  // key is public by design; the secret (secret_key_enc) NEVER appears here,
  // only the boolean saying whether one exists somewhere.
  stripe_publishable_key: string;
  payments_configured: boolean;
};

export const HERO_DEFAULT: HeroBanner = {
  enabled: true,
  heading: "Every Bite, Eggless & Divine",
  subtext: "Handcrafted fresh daily — pick your craving",
};

// No hardcoded number — it must come solely from the DB (whatsapp_bar.number).
// The bar is only rendered when a number is actually present (see the Menu
// page guard), so an empty default just means "hidden until configured".
export const WHATSAPP_BAR_DEFAULT: WhatsappBar = {
  enabled: false,
  text: "For any question",
  number: "",
};

export const CONTACT_DEFAULT: Contact = {
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
};

// Fallback shown on the Menu page when the DB has no rotating_banners yet.
export const DEFAULT_ROTATING_BANNERS: RotatingBanner[] = [
  {
    type: "custom_cakes",
    heading: "Custom Cakes for Every Occasion",
    subtext:
      "Birthdays, weddings, anniversaries — we craft the perfect eggless cake for your event",
    cta_text: "Order Custom Cake",
    cta_link: "/contact",
    watermark_text: "",
    right_content_type: "highlight",
    right_image_url: "",
    enabled: true,
  },
  {
    type: "offer",
    heading: "Special Offer",
    subtext: "Free delivery on orders over £60",
    cta_text: "Shop Now",
    cta_link: "/menu",
    watermark_text: "",
    right_content_type: "highlight",
    right_image_url: "",
    enabled: true,
  },
];

const BANNER_TYPES: BannerType[] = ["hero", "offer", "announcement", "custom_cakes"];

// Default landing-page slider images (all on the already-whitelisted Unsplash
// host). Shown until the admin sets site_settings.home_slider.
export const DEFAULT_HOME_SLIDER: string[] = [
  "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1535141192574-5d4897c12636?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=1600&q=80",
];

export const DEFAULT_ABOUT_TEXT =
  "Le Rasa is a house of 100% eggless desserts — handcrafted cakes, cupcakes, brownies and gift boxes, baked fresh daily with real ingredients so every celebration can be shared by everyone.";

// ============================================================
// Branding — the single source of truth for every piece of brand copy
// shown across the site (wordmark, tagline, descriptions, SEO). Stored in
// the site_settings.branding jsonb column and edited from the admin
// "Branding Settings" section. Every field defaults to the values that
// were previously hardcoded, so the site is unchanged until the admin
// edits them, and nothing breaks if the column hasn't been migrated yet.
// ============================================================
export type Branding = {
  /** Full bakery name (e.g. SEO, structured data). */
  name: string;
  /** Compact wordmark shown in the navbar / footer / splash. */
  short_name: string;
  /** The line under the wordmark — replaces the old "Eggless Bakery". */
  tagline: string;
  /** Business description (SEO / about blurbs). */
  description: string;
  /** Subtitle shown under the wordmark on the splash screen. */
  hero_subtitle: string;
  /** Paragraph under the footer wordmark. */
  footer_description: string;
  /** Text after "© {year}" in the footer copyright line. */
  copyright: string;
};

export const BRANDING_DEFAULT: Branding = {
  name: "Le Rasa Bakery",
  short_name: "Le Rasa",
  tagline: "House of Eggless Desserts",
  description:
    "Le Rasa Bakery crafts stunning, 100% eggless cakes, cupcakes, brownies, cookies and gift boxes. Premium desserts everyone can share.",
  hero_subtitle: "The House of Eggless Desserts",
  footer_description:
    "The house of eggless desserts. Handcrafted cakes & treats baked fresh, so everyone gets a slice of the celebration.",
  copyright: "Le Rasa Bakery. All rights reserved.",
};

/** Coerce an unknown value into a fully-populated Branding, field-by-field,
 *  so a partial or legacy row still yields every default. */
export function normaliseBranding(raw: unknown): Branding {
  const b = (raw ?? {}) as Partial<Record<keyof Branding, unknown>>;
  const pick = (v: unknown, fallback: string) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s || fallback;
  };
  return {
    name: pick(b.name, BRANDING_DEFAULT.name),
    short_name: pick(b.short_name, BRANDING_DEFAULT.short_name),
    tagline: pick(b.tagline, BRANDING_DEFAULT.tagline),
    description: pick(b.description, BRANDING_DEFAULT.description),
    hero_subtitle: pick(b.hero_subtitle, BRANDING_DEFAULT.hero_subtitle),
    footer_description: pick(b.footer_description, BRANDING_DEFAULT.footer_description),
    copyright: pick(b.copyright, BRANDING_DEFAULT.copyright),
  };
}

/** Coerce an unknown value into a valid RotatingBanner. */
function normaliseBanner(v: unknown): RotatingBanner {
  const b = (v ?? {}) as Partial<RotatingBanner>;
  const type = BANNER_TYPES.includes(b.type as BannerType) ? (b.type as BannerType) : "hero";
  const rightImage = typeof b.right_image_url === "string" ? b.right_image_url : "";
  // Only honour "image" when an image is actually stored, so a half-configured
  // banner falls back to the highlight rather than rendering a blank right side.
  const rightType: BannerRightContentType =
    b.right_content_type === "image" && rightImage.trim() !== "" ? "image" : "highlight";
  return {
    type,
    heading: typeof b.heading === "string" ? b.heading : "",
    subtext: typeof b.subtext === "string" ? b.subtext : "",
    cta_text: typeof b.cta_text === "string" ? b.cta_text : "",
    cta_link: typeof b.cta_link === "string" ? b.cta_link : "",
    watermark_text: typeof b.watermark_text === "string" ? b.watermark_text : "",
    right_content_type: rightType,
    right_image_url: rightImage,
    enabled: b.enabled !== false,
  };
}

// Sensible defaults so the storefront still renders when the DB row is
// empty or a column has not been added yet.
// The only two Stripe values the storefront may see. Derived, never raw:
// the DB config (set in the admin panel) wins, env vars are the fallback —
// matching the server-side precedence in lib/stripe.ts. STRIPE_SECRET_KEY is
// read purely as a boolean, and only ever resolves on the server (this runs
// inside getPublicSettings), so no secret is ever serialised to the client.
function stripePublic(raw: unknown): {
  stripe_publishable_key: string;
  payments_configured: boolean;
} {
  const cfg = (raw ?? {}) as { publishable_key?: unknown; secret_key_enc?: unknown };
  const key =
    str(cfg.publishable_key) ||
    (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");
  const hasSecret =
    Boolean(cfg.secret_key_enc) || Boolean(process.env.STRIPE_SECRET_KEY);
  return {
    stripe_publishable_key: key,
    payments_configured: Boolean(key) && hasSecret,
  };
}

export const DEFAULT_SETTINGS: PublicSettings = {
  ...stripePublic(null),
  branding: BRANDING_DEFAULT,
  contact: CONTACT_DEFAULT,
  logo: "",
  instagram_url: "",
  instagram_reels: [],
  facebook_url: "",
  tiktok_url: "",
  announcement: { enabled: false, text: "" },
  hero_banner: HERO_DEFAULT,
  rotating_banners: DEFAULT_ROTATING_BANNERS,
  whatsapp_bar: WHATSAPP_BAR_DEFAULT,
  about: { text: DEFAULT_ABOUT_TEXT, image_url: "" },
  home_slider: DEFAULT_HOME_SLIDER,
  delivery_zones: [],
  lead_time_days: 3,
  blocked_dates: [],
  delivery_days: [...ALL_DELIVERY_DAYS],
};

// Columns the storefront may read (fed to the Supabase REST select).
// `contact` is the unified contact jsonb; phone/email/address/whatsapp are the
// legacy columns still read as a fallback until `contact` is populated.
// `stripe_config` is fetched only so normaliseSettings can derive the two safe
// values above — the raw column (incl. secret_key_enc) never leaves this layer.
export const PUBLIC_SETTINGS_SELECT =
  "branding,contact,logo,phone,email,address,whatsapp,instagram_url,instagram_reels,facebook_url,tiktok_url,announcement,hero_banner,rotating_banners,whatsapp_bar,about_story,about_image_url,home_slider,delivery_zones,lead_time_days,blocked_dates,delivery_days,stripe_config";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Instagram is stored as a single value (site_settings.instagram_url) that the
// admin can enter either as a handle ("@lerasabakery") or a full URL. These
// helpers derive the two shapes the UI needs so every Instagram link/label
// across the site reads from that one field.

/** Full Instagram profile URL from a handle or URL. Empty input -> "". */
export function instagramUrl(value: string): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "").replace(/^instagram\.com\//i, "");
  return handle ? `https://instagram.com/${handle}` : "";
}

/** Display "@handle" from a handle or URL. Empty input -> "". */
export function instagramHandle(value: string): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) {
    const m = v.replace(/\/+$/, "").match(/instagram\.com\/([^/?#]+)/i);
    return m ? `@${m[1]}` : "";
  }
  return `@${v.replace(/^@/, "")}`;
}

// Instagram Reels — each reel is a URL plus an admin-uploaded cover image (and
// an optional title + an active flag). Display order is the array order. These
// helpers keep the list clean (valid reel URLs only, de-duplicated, capped at
// 10) and tolerate the LEGACY shape where a reel was just a URL string.

export const MAX_INSTAGRAM_REELS = 10;

export type InstagramReel = {
  url: string;
  /** Admin-uploaded cover image (Supabase Storage public URL). "" → fallback. */
  cover_image: string;
  title: string;
  active: boolean;
};

/** Extract the shortcode from a reel/post/tv URL, or "" if it isn't one. */
export function instagramShortcode(url: string): string {
  const v = (url ?? "").trim();
  const m = v.match(/instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : "";
}

/** Clean an incoming reels value into an ordered list of unique reels (max 10).
 *  Accepts BOTH the current object shape and the legacy `string[]` of URLs, so
 *  existing data keeps working. Anything without a recognisable Instagram reel
 *  URL is dropped. */
export function normalizeInstagramReels(raw: unknown): InstagramReel[] {
  if (!Array.isArray(raw)) return [];
  const out: InstagramReel[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    let url = "";
    let cover = "";
    let title = "";
    let active = true;
    if (typeof item === "string") {
      url = item.trim();
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      url = String(o.url ?? "").trim();
      cover = String(o.cover_image ?? "").trim();
      title = String(o.title ?? "").trim().slice(0, 120);
      active = o.active !== false;
    }
    const code = instagramShortcode(url);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ url, cover_image: cover, title, active });
    if (out.length >= MAX_INSTAGRAM_REELS) break;
  }
  return out;
}

/** Normalise a raw site_settings row into a fully-populated PublicSettings. */
export function normaliseSettings(
  raw: Record<string, unknown> | null,
): PublicSettings {
  const r = raw ?? {};
  const ann = (r.announcement ?? {}) as Partial<Announcement>;
  const hero = (r.hero_banner ?? {}) as Partial<HeroBanner>;
  const wab = (r.whatsapp_bar ?? {}) as Partial<WhatsappBar>;
  // Prefer the unified `contact` jsonb; fall back to the legacy top-level
  // columns so the site keeps working before the data is migrated.
  const c = (r.contact ?? {}) as Partial<Contact>;

  return {
    ...stripePublic(r.stripe_config),
    branding: normaliseBranding(r.branding),
    contact: {
      phone: str(c.phone) || str(r.phone),
      whatsapp: str(c.whatsapp) || str(r.whatsapp),
      email: str(c.email) || str(r.email),
      address: str(c.address) || str(r.address),
    },
    logo: str(r.logo),
    instagram_url: str(r.instagram_url),
    instagram_reels: normalizeInstagramReels(r.instagram_reels),
    facebook_url: str(r.facebook_url),
    tiktok_url: str(r.tiktok_url),
    announcement: {
      enabled: Boolean(ann.enabled),
      text: str(ann.text),
    },
    hero_banner: {
      enabled: hero.enabled ?? HERO_DEFAULT.enabled,
      heading: str(hero.heading) || HERO_DEFAULT.heading,
      subtext: str(hero.subtext) || HERO_DEFAULT.subtext,
    },
    // Use the DB array when present & non-empty; otherwise fall back to the
    // default banners so the Menu page always has something to show.
    rotating_banners:
      Array.isArray(r.rotating_banners) && (r.rotating_banners as unknown[]).length > 0
        ? (r.rotating_banners as unknown[]).map(normaliseBanner)
        : DEFAULT_ROTATING_BANNERS,
    // About text: prefer an `about` jsonb, fall back to the legacy about_story
    // column, then a sensible default so the landing page is never blank.
    about: {
      text:
        str((r.about as { text?: unknown } | undefined)?.text) ||
        str(r.about_story) ||
        DEFAULT_ABOUT_TEXT,
      image_url:
        str((r.about as { image_url?: unknown } | undefined)?.image_url) ||
        str(r.about_image_url),
    },
    // Landing-page slider images (jsonb string[]); default when empty/missing.
    home_slider:
      Array.isArray(r.home_slider) && (r.home_slider as unknown[]).length > 0
        ? (r.home_slider as unknown[]).filter(
            (u): u is string => typeof u === "string" && u.trim() !== "",
          )
        : DEFAULT_HOME_SLIDER,
    whatsapp_bar: {
      enabled: wab.enabled ?? WHATSAPP_BAR_DEFAULT.enabled,
      text: str(wab.text) || WHATSAPP_BAR_DEFAULT.text,
      number: str(wab.number) || WHATSAPP_BAR_DEFAULT.number,
    },
    delivery_zones: Array.isArray(r.delivery_zones)
      ? (r.delivery_zones as DeliveryZone[])
      : [],
    lead_time_days:
      typeof r.lead_time_days === "number" ? r.lead_time_days : 3,
    blocked_dates: Array.isArray(r.blocked_dates)
      ? (r.blocked_dates as string[])
      : [],
    delivery_days: Array.isArray(r.delivery_days)
      ? (r.delivery_days as string[])
      : [...ALL_DELIVERY_DAYS],
  };
}
