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
export type DeliveryZone = {
  id: string;
  name: string;
  postcode_prefix: string;
  fee: number;
};

export type PublicSettings = {
  phone: string;
  email: string;
  address: string;
  whatsapp: string;
  instagram_url: string;
  facebook_url: string;
  tiktok_url: string;
  announcement: Announcement;
  hero_banner: HeroBanner;
  whatsapp_bar: WhatsappBar;
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

export const WHATSAPP_BAR_DEFAULT: WhatsappBar = {
  enabled: true,
  text: "For any question",
  number: "441234567890",
};

// Sensible defaults so the storefront still renders when the DB row is
// empty or a column has not been added yet.
export const DEFAULT_SETTINGS: PublicSettings = {
  phone: "",
  email: "",
  address: "",
  whatsapp: "",
  instagram_url: "",
  facebook_url: "",
  tiktok_url: "",
  announcement: { enabled: false, text: "" },
  hero_banner: HERO_DEFAULT,
  whatsapp_bar: WHATSAPP_BAR_DEFAULT,
  delivery_zones: [],
  lead_time_days: 3,
  blocked_dates: [],
  delivery_days: [...ALL_DELIVERY_DAYS],
};

// Columns the storefront may read (fed to the Supabase REST select).
export const PUBLIC_SETTINGS_SELECT =
  "phone,email,address,whatsapp,instagram_url,facebook_url,tiktok_url,announcement,hero_banner,whatsapp_bar,delivery_zones,lead_time_days,blocked_dates,delivery_days";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Normalise a raw site_settings row into a fully-populated PublicSettings. */
export function normaliseSettings(
  raw: Record<string, unknown> | null,
): PublicSettings {
  const r = raw ?? {};
  const ann = (r.announcement ?? {}) as Partial<Announcement>;
  const hero = (r.hero_banner ?? {}) as Partial<HeroBanner>;
  const wab = (r.whatsapp_bar ?? {}) as Partial<WhatsappBar>;

  return {
    phone: str(r.phone),
    email: str(r.email),
    address: str(r.address),
    whatsapp: str(r.whatsapp),
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
