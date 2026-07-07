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
export type RotatingBanner = {
  type: BannerType;
  heading: string;
  subtext: string;
  cta_text: string;
  cta_link: string;
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
  contact: Contact;
  instagram_url: string;
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
    enabled: true,
  },
  {
    type: "offer",
    heading: "Special Offer",
    subtext: "Free delivery on orders over £60",
    cta_text: "Shop Now",
    cta_link: "/menu",
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

/** Coerce an unknown value into a valid RotatingBanner. */
function normaliseBanner(v: unknown): RotatingBanner {
  const b = (v ?? {}) as Partial<RotatingBanner>;
  const type = BANNER_TYPES.includes(b.type as BannerType) ? (b.type as BannerType) : "hero";
  return {
    type,
    heading: typeof b.heading === "string" ? b.heading : "",
    subtext: typeof b.subtext === "string" ? b.subtext : "",
    cta_text: typeof b.cta_text === "string" ? b.cta_text : "",
    cta_link: typeof b.cta_link === "string" ? b.cta_link : "",
    enabled: b.enabled !== false,
  };
}

// Sensible defaults so the storefront still renders when the DB row is
// empty or a column has not been added yet.
export const DEFAULT_SETTINGS: PublicSettings = {
  contact: CONTACT_DEFAULT,
  instagram_url: "",
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
export const PUBLIC_SETTINGS_SELECT =
  "contact,phone,email,address,whatsapp,instagram_url,facebook_url,tiktok_url,announcement,hero_banner,rotating_banners,whatsapp_bar,about_story,about_image_url,home_slider,delivery_zones,lead_time_days,blocked_dates,delivery_days";

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
    contact: {
      phone: str(c.phone) || str(r.phone),
      whatsapp: str(c.whatsapp) || str(r.whatsapp),
      email: str(c.email) || str(r.email),
      address: str(c.address) || str(r.address),
    },
    instagram_url: str(r.instagram_url),
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
