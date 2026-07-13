"use client";

// ============================================================
// Le Rasa Bakery — Content & Settings admin
// Five independently-saved sections, all persisting to the singleton
// site_settings row via /api/admin/settings (PUT does a whitelisted
// partial update, so each section only writes its own fields).
//   1. Contact details   2. Announcement banner   3. Social media
//   4. Homepage hero      5. About page
// Hero/about images upload to the `site-assets` bucket.
//
// Requires supabase/sql/07_content_settings.sql.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { adminGet, adminSend, adminUpload } from "@/lib/admin-api";

const WINE = "#873853";
const BERRY = "#5C2A41";

type Announcement = { enabled: boolean; text: string };
type HeroBanner = { enabled: boolean; heading: string; subtext: string };
type WhatsappBar = { enabled: boolean; text: string; number: string };
type Contact = { phone: string; whatsapp: string; email: string; address: string };
type BannerType = "hero" | "offer" | "announcement" | "custom_cakes";
type BannerRightContentType = "highlight" | "image";
type RotatingBanner = {
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

const CONTACT_DEFAULT: Contact = { phone: "", whatsapp: "", email: "", address: "" };

const BANNER_TYPE_OPTIONS: { value: BannerType; label: string }[] = [
  { value: "custom_cakes", label: "🎂 Custom Cakes" },
  { value: "offer", label: "🎁 Offer" },
  { value: "hero", label: "Hero" },
  { value: "announcement", label: "📣 Announcement" },
];

const BANNER_RIGHT_CONTENT_OPTIONS: { value: BannerRightContentType; label: string }[] = [
  { value: "highlight", label: "Hero Highlight Text" },
  { value: "image", label: "Image" },
];

const DEFAULT_ROTATING_BANNERS: RotatingBanner[] = [
  {
    type: "custom_cakes",
    heading: "Custom Cakes for Every Occasion",
    subtext: "Birthdays, weddings, anniversaries — we craft the perfect eggless cake for your event",
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

const HERO_DEFAULT: HeroBanner = {
  enabled: true,
  heading: "Every Bite, Eggless & Divine",
  subtext: "Handcrafted fresh daily — pick your craving",
};

const WHATSAPP_BAR_DEFAULT: WhatsappBar = {
  enabled: false,
  text: "For any question",
  number: "",
};

type Settings = {
  contact: Contact;
  logo: string;
  announcement: Announcement;
  hero_banner: HeroBanner;
  rotating_banners: RotatingBanner[];
  home_slider: string[];
  whatsapp_bar: WhatsappBar;
  instagram_url: string;
  facebook_url: string;
  tiktok_url: string;
  hero_tagline: string;
  hero_button_text: string;
  hero_image_url: string;
  about_story: string;
  about_image_url: string;
};

const EMPTY: Settings = {
  contact: CONTACT_DEFAULT,
  logo: "",
  announcement: { enabled: false, text: "" },
  hero_banner: HERO_DEFAULT,
  rotating_banners: DEFAULT_ROTATING_BANNERS,
  home_slider: [],
  whatsapp_bar: WHATSAPP_BAR_DEFAULT,
  instagram_url: "",
  facebook_url: "",
  tiktok_url: "",
  hero_tagline: "",
  hero_button_text: "",
  hero_image_url: "",
  about_story: "",
  about_image_url: "",
};

export default function SettingsAdminPage() {
  const [s, setS] = useState<Settings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Which section last saved successfully (for the inline "Saved ✓").
  const [savedSection, setSavedSection] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminGet<{ settings: Partial<Settings> | null }>(
        "/api/admin/settings",
      );
      const d = data.settings ?? {};
      const ann = (d.announcement ?? {}) as Partial<Announcement>;
      const hb = (d.hero_banner ?? {}) as Partial<HeroBanner>;
      const wab = (d.whatsapp_bar ?? {}) as Partial<WhatsappBar>;
      // Prefer the unified `contact` jsonb; fall back to legacy columns that
      // may still be present on the row (phone/whatsapp/email/address).
      const dRaw = d as Record<string, unknown>;
      const c = (d.contact ?? {}) as Partial<Contact>;
      const contact: Contact = {
        phone: (c.phone ?? (dRaw.phone as string) ?? "") || "",
        whatsapp: (c.whatsapp ?? (dRaw.whatsapp as string) ?? "") || "",
        email: (c.email ?? (dRaw.email as string) ?? "") || "",
        address: (c.address ?? (dRaw.address as string) ?? "") || "",
      };
      const rb = Array.isArray(d.rotating_banners) && d.rotating_banners.length > 0
        ? (d.rotating_banners as RotatingBanner[]).map((b) => ({
            type: (["hero", "offer", "announcement", "custom_cakes"].includes(b?.type) ? b.type : "hero") as BannerType,
            heading: typeof b?.heading === "string" ? b.heading : "",
            subtext: typeof b?.subtext === "string" ? b.subtext : "",
            cta_text: typeof b?.cta_text === "string" ? b.cta_text : "",
            cta_link: typeof b?.cta_link === "string" ? b.cta_link : "",
            watermark_text: typeof b?.watermark_text === "string" ? b.watermark_text : "",
            // Legacy banners carry neither field — they default to the
            // highlight, which is exactly how they render today.
            right_content_type: (b?.right_content_type === "image" ? "image" : "highlight") as BannerRightContentType,
            right_image_url: typeof b?.right_image_url === "string" ? b.right_image_url : "",
            enabled: b?.enabled !== false,
          }))
        : DEFAULT_ROTATING_BANNERS;
      const slider = Array.isArray(d.home_slider)
        ? (d.home_slider as unknown[]).filter((u): u is string => typeof u === "string" && u.trim() !== "")
        : [];
      setS({
        ...EMPTY,
        ...Object.fromEntries(
          Object.entries(d).filter(([, v]) => v != null),
        ),
        contact,
        rotating_banners: rb,
        home_slider: slider,
        announcement: {
          enabled: Boolean(ann.enabled),
          text: ann.text ?? "",
        },
        hero_banner: {
          enabled: hb.enabled ?? HERO_DEFAULT.enabled,
          heading: hb.heading ?? HERO_DEFAULT.heading,
          subtext: hb.subtext ?? HERO_DEFAULT.subtext,
        },
        whatsapp_bar: {
          enabled: wab.enabled ?? WHATSAPP_BAR_DEFAULT.enabled,
          text: wab.text ?? WHATSAPP_BAR_DEFAULT.text,
          number: wab.number ?? WHATSAPP_BAR_DEFAULT.number,
        },
      } as Settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setS((f) => ({ ...f, [key]: value }));
    setSavedSection("");
  }

  // Save only the given keys for a section.
  async function saveSection(section: string, keys: (keyof Settings)[]) {
    setError("");
    setSavedSection("");
    const payload: Partial<Settings> = {};
    for (const k of keys) (payload as Record<string, unknown>)[k] = s[k];
    try {
      await adminSend("/api/admin/settings", "PUT", payload);
      setSavedSection(section);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 640 }}>
        <Header />
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <Header />
      {error && <p style={errorBox}>{error}</p>}

      {/* 0. LOGO — brand mark shown in the navbar, footer and splash */}
      <SectionForm
        title="Logo"
        saved={savedSection === "logo"}
        onSave={() => saveSection("logo", ["logo"])}
      >
        <Field label="Site logo">
          <ImageUpload
            url={s.logo}
            onChange={(url) => set("logo", url)}
            onError={setError}
          />
        </Field>
        <p style={hint}>
          Shown in the navbar (top-left), the footer and the splash screen. Use a
          transparent PNG. Leave empty to fall back to the “Le Rasa” wordmark.
          Saving updates every page instantly.
        </p>
      </SectionForm>

      {/* 1. CONTACT DETAILS — single source of truth, saved together */}
      <SectionForm
        title="Contact Details"
        saveLabel="Save All"
        saved={savedSection === "contact"}
        onSave={() => saveSection("contact", ["contact", "instagram_url"])}
      >
        <Field label="Phone number">
          <input
            style={inputStyle}
            value={s.contact.phone}
            onChange={(e) => set("contact", { ...s.contact, phone: e.target.value })}
            placeholder="e.g. 07xxx xxxxxx"
          />
        </Field>
        <Field label="WhatsApp number">
          <input
            style={inputStyle}
            value={s.contact.whatsapp}
            onChange={(e) => set("contact", { ...s.contact, whatsapp: e.target.value })}
            placeholder="e.g. 447123456789 (country code, digits only)"
          />
        </Field>
        <Field label="Email">
          <input
            style={inputStyle}
            type="email"
            value={s.contact.email}
            onChange={(e) => set("contact", { ...s.contact, email: e.target.value })}
            placeholder="hello@lerasa.co.uk"
          />
        </Field>
        <Field label="Address">
          <textarea
            style={textareaStyle}
            value={s.contact.address}
            onChange={(e) => set("contact", { ...s.contact, address: e.target.value })}
            placeholder="Shop address"
          />
        </Field>
        <Field label="Instagram">
          <input
            style={inputStyle}
            value={s.instagram_url}
            onChange={(e) => set("instagram_url", e.target.value)}
            placeholder="@lerasabakery or https://instagram.com/lerasabakery"
          />
        </Field>
        <p style={hint}>
          These details feed the whole site — top bar, footer, contact page and the
          WhatsApp bar. The Instagram link powers the footer icon, the “Follow us”
          button and the contact page. Saving once updates everywhere instantly.
        </p>
      </SectionForm>

      {/* 2. ANNOUNCEMENT BANNER */}
      <SectionForm
        title="Announcement banner"
        saved={savedSection === "announcement"}
        onSave={() => saveSection("announcement", ["announcement"])}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, cursor: "pointer" }}>
          <Toggle
            on={s.announcement.enabled}
            onClick={() =>
              set("announcement", { ...s.announcement, enabled: !s.announcement.enabled })
            }
          />
          <span style={{ fontWeight: 600, color: BERRY }}>
            {s.announcement.enabled ? "Banner is ON" : "Banner is off"}
          </span>
        </label>
        <Field label="Banner text">
          <input
            style={inputStyle}
            value={s.announcement.text}
            onChange={(e) => set("announcement", { ...s.announcement, text: e.target.value })}
            placeholder="e.g. Free delivery on orders over £50 this week!"
          />
        </Field>
        <p style={hint}>When on, this shows as a bar across the top of the whole site.</p>
      </SectionForm>

      {/* 2b. ROTATING BANNERS (Menu page) */}
      <RotatingBannersSection
        banners={s.rotating_banners}
        onChange={(next) => set("rotating_banners", next)}
        onError={setError}
        saved={savedSection === "rotating_banners"}
        onSave={() => saveSection("rotating_banners", ["rotating_banners"])}
      />

      {/* 2b-2. HOME SLIDER (Home landing page) */}
      <HomeSliderSection
        images={s.home_slider}
        onChange={(next) => set("home_slider", next)}
        onError={setError}
        saved={savedSection === "home_slider"}
        onSave={() => saveSection("home_slider", ["home_slider"])}
      />

      {/* 2c. WHATSAPP BAR (Menu page) */}
      <SectionForm
        title="WhatsApp Bar"
        saved={savedSection === "whatsapp_bar"}
        onSave={() => saveSection("whatsapp_bar", ["whatsapp_bar"])}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, cursor: "pointer" }}>
          <Toggle
            on={s.whatsapp_bar.enabled}
            onClick={() =>
              set("whatsapp_bar", { ...s.whatsapp_bar, enabled: !s.whatsapp_bar.enabled })
            }
          />
          <span style={{ fontWeight: 600, color: BERRY }}>
            {s.whatsapp_bar.enabled ? "Bar is visible" : "Bar is hidden"}
          </span>
        </label>
        <Field label="Bar text">
          <input
            style={inputStyle}
            value={s.whatsapp_bar.text}
            onChange={(e) => set("whatsapp_bar", { ...s.whatsapp_bar, text: e.target.value })}
            placeholder="For any question"
          />
        </Field>
        <p style={hint}>
          Shows a bar at the top of the Menu page with your text and a bold “Click here” link
          that opens WhatsApp. The number comes from <strong>Contact Details</strong> above —
          the bar only appears when a WhatsApp number is set there.
        </p>
      </SectionForm>

      {/* 3. SOCIAL MEDIA (Instagram lives in Contact Details above) */}
      <SectionForm
        title="Social media"
        saved={savedSection === "social"}
        onSave={() => saveSection("social", ["facebook_url", "tiktok_url"])}
      >
        <Field label="Facebook URL">
          <input style={inputStyle} value={s.facebook_url} onChange={(e) => set("facebook_url", e.target.value)} placeholder="https://facebook.com/..." />
        </Field>
        <Field label="TikTok URL">
          <input style={inputStyle} value={s.tiktok_url} onChange={(e) => set("tiktok_url", e.target.value)} placeholder="https://tiktok.com/@..." />
        </Field>
        <p style={hint}>Instagram is managed in <strong>Contact Details</strong> above.</p>
      </SectionForm>

      {/* 4. HOMEPAGE */}
      <SectionForm
        title="Homepage"
        saved={savedSection === "homepage"}
        onSave={() => saveSection("homepage", ["hero_tagline", "hero_button_text", "hero_image_url"])}
      >
        <Field label="Hero tagline">
          <input style={inputStyle} value={s.hero_tagline} onChange={(e) => set("hero_tagline", e.target.value)} placeholder="Freshly baked, made with love" />
        </Field>
        <Field label="Hero button text">
          <input style={inputStyle} value={s.hero_button_text} onChange={(e) => set("hero_button_text", e.target.value)} placeholder="Shop now" />
        </Field>
        <Field label="Hero image">
          <ImageUpload
            url={s.hero_image_url}
            onChange={(url) => set("hero_image_url", url)}
            onError={setError}
          />
        </Field>
      </SectionForm>

      {/* 5. ABOUT PAGE */}
      <SectionForm
        title="About page"
        saved={savedSection === "about"}
        onSave={() => saveSection("about", ["about_story", "about_image_url"])}
      >
        <Field label="Our story">
          <textarea
            style={{ ...textareaStyle, minHeight: 140 }}
            value={s.about_story}
            onChange={(e) => set("about_story", e.target.value)}
            placeholder="Tell customers the story of the bakery…"
          />
        </Field>
        <Field label="About photo">
          <ImageUpload
            url={s.about_image_url}
            onChange={(url) => set("about_image_url", url)}
            onError={setError}
          />
        </Field>
      </SectionForm>

      {/* 6. ORDER NOTIFICATIONS — saved through its own endpoint, because the
             API key and token are secrets that never travel back to the
             browser (same posture as the Stripe keys on the Payments page). */}
      <NotificationsSection onError={setError} />
    </div>
  );
}

// ---------------- order notifications ----------------

type NotificationView = {
  from_email: string;
  from_name: string;
  whatsapp_phone_id: string;
  owner_phone: string;
  has_resend_key: boolean;
  resend_key_last4: string;
  has_whatsapp_token: boolean;
  whatsapp_token_last4: string;
};

const EMPTY_NOTIFICATIONS: NotificationView = {
  from_email: "",
  from_name: "",
  whatsapp_phone_id: "",
  owner_phone: "",
  has_resend_key: false,
  resend_key_last4: "",
  has_whatsapp_token: false,
  whatsapp_token_last4: "",
};

function NotificationsSection({ onError }: { onError: (msg: string) => void }) {
  const [cfg, setCfg] = useState<NotificationView>(EMPTY_NOTIFICATIONS);
  const [resendKey, setResendKey] = useState("");
  const [whatsappToken, setWhatsappToken] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminGet<{ config: NotificationView }>("/api/admin/notifications")
      .then((d) => setCfg({ ...EMPTY_NOTIFICATIONS, ...d.config }))
      .catch(() => {
        /* not migrated yet — the section just starts empty */
      });
  }, []);

  async function save() {
    setSaved(false);
    onError("");
    try {
      await adminSend("/api/admin/notifications", "PUT", {
        from_email: cfg.from_email,
        from_name: cfg.from_name,
        whatsapp_phone_id: cfg.whatsapp_phone_id,
        owner_phone: cfg.owner_phone,
        // Blank = keep the stored secret.
        resend_key: resendKey,
        whatsapp_token: whatsappToken,
      });
      setResendKey("");
      setWhatsappToken("");
      const fresh = await adminGet<{ config: NotificationView }>(
        "/api/admin/notifications",
        { force: true },
      );
      setCfg({ ...EMPTY_NOTIFICATIONS, ...fresh.config });
      setSaved(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to save notification settings");
    }
  }

  const set = <K extends keyof NotificationView>(k: K, v: NotificationView[K]) => {
    setCfg((c) => ({ ...c, [k]: v }));
    setSaved(false);
  };

  return (
    <SectionForm title="Order notifications" saved={saved} onSave={save}>
      <p style={{ color: BERRY, opacity: 0.75, margin: "0 0 6px", fontSize: "0.88rem" }}>
        When an order is paid, the customer gets an email and you get a WhatsApp
        message — both listing the cake, its accessories, every message and note,
        and the total. Leave a field blank to switch that notification off; an
        order is never affected either way.
      </p>

      <Field label="Customer email — Resend API key">
        <input
          style={inputStyle}
          type="password"
          value={resendKey}
          onChange={(e) => setResendKey(e.target.value)}
          placeholder={
            cfg.has_resend_key
              ? `Saved — ends ${cfg.resend_key_last4}. Type a new key to replace it.`
              : "re_…"
          }
        />
      </Field>
      <Field label="Send from (a domain verified in Resend)">
        <input
          style={inputStyle}
          value={cfg.from_email}
          onChange={(e) => set("from_email", e.target.value)}
          placeholder="orders@lerasa.co.uk"
        />
      </Field>
      <Field label="Send from name">
        <input
          style={inputStyle}
          value={cfg.from_name}
          onChange={(e) => set("from_name", e.target.value)}
          placeholder="Le Rasa Bakery"
        />
      </Field>

      <Field label="Owner WhatsApp — Meta Cloud API token">
        <input
          style={inputStyle}
          type="password"
          value={whatsappToken}
          onChange={(e) => setWhatsappToken(e.target.value)}
          placeholder={
            cfg.has_whatsapp_token
              ? `Saved — ends ${cfg.whatsapp_token_last4}. Type a new token to replace it.`
              : "EAA…"
          }
        />
      </Field>
      <Field label="WhatsApp phone number ID">
        <input
          style={inputStyle}
          value={cfg.whatsapp_phone_id}
          onChange={(e) => set("whatsapp_phone_id", e.target.value)}
          placeholder="From Meta → WhatsApp → API setup"
        />
      </Field>
      <Field label="Notify this number (country code, digits only)">
        <input
          style={inputStyle}
          value={cfg.owner_phone}
          onChange={(e) => set("owner_phone", e.target.value)}
          placeholder="447700900123"
        />
      </Field>
    </SectionForm>
  );
}

function Header() {
  return (
    <>
      <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, marginTop: 0 }}>
        Content &amp; Settings
      </h1>
      <p style={{ color: BERRY, opacity: 0.75, marginTop: 4 }}>
        Contact details, the site-wide announcement banner, social links, and
        homepage &amp; about page content. Each section saves on its own.
      </p>
    </>
  );
}

// ---------------- image upload ----------------
function ImageUpload({
  url,
  onChange,
  onError,
}: {
  url: string;
  onChange: (url: string) => void;
  onError: (msg: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    onError("");
    try {
      const { url } = await adminUpload(file, "/api/admin/site-assets/upload");
      onChange(url);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Preview"
          style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 12, border: "1px solid rgba(135,56,83,0.2)" }}
        />
      ) : (
        <div style={{ width: 96, height: 96, borderRadius: 12, background: "rgba(135,56,83,0.07)", display: "grid", placeItems: "center", color: BERRY, opacity: 0.5, fontSize: "0.75rem" }}>
          No image
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ ...ghostBtn, display: "inline-block" }}>
          {uploading ? "Uploading…" : url ? "Replace" : "Upload image"}
          <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} style={{ display: "none" }} />
        </label>
        {url && (
          <button type="button" style={linkBtn} onClick={() => onChange("")}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------- presentational helpers ----------------
function SectionForm({
  title,
  saved,
  onSave,
  children,
  saveLabel = "Save",
}: {
  title: string;
  saved: boolean;
  onSave: () => void;
  children: React.ReactNode;
  saveLabel?: string;
}) {
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave();
    setSaving(false);
  }
  return (
    <form
      onSubmit={submit}
      style={{ background: "white", borderRadius: 16, padding: "1.5rem 1.75rem", marginTop: 20, boxShadow: "0 10px 30px rgba(135,56,83,0.08)" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12 }}>
        <h2 style={{ color: WINE, margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>{title}</h2>
        {saved && <span style={{ color: "#2e7d4f", fontWeight: 700, fontSize: "0.9rem" }}>Saved ✓</span>}
      </div>
      {children}
      <button type="submit" disabled={saving} style={{ ...primaryBtn, marginTop: 8, opacity: saving ? 0.6 : 1 }}>
        {saving ? "Saving…" : saveLabel}
      </button>
    </form>
  );
}

// ---------------- Rotating banners (list + drag reorder) ----------------
let _bid = 0;
const nextBid = () => `b${_bid++}`;

function RotatingBannersSection({
  banners,
  onChange,
  onError,
  saved,
  onSave,
}: {
  banners: RotatingBanner[];
  onChange: (next: RotatingBanner[]) => void;
  onError: (msg: string) => void;
  saved: boolean;
  onSave: () => void;
}) {
  const [saving, setSaving] = useState(false);
  // Stable client-side ids so drag-and-drop keys survive edits/reorders.
  const [ids, setIds] = useState<string[]>(() => banners.map(() => nextBid()));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Keep the id list length in step with the banners (safety net).
  useEffect(() => {
    setIds((prev) => {
      if (prev.length === banners.length) return prev;
      if (prev.length < banners.length) {
        const extra = Array.from({ length: banners.length - prev.length }, () => nextBid());
        return [...prev, ...extra];
      }
      return prev.slice(0, banners.length);
    });
  }, [banners.length]);

  function update(i: number, patch: Partial<RotatingBanner>) {
    onChange(banners.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function add() {
    onChange([
      ...banners,
      {
        type: "offer",
        heading: "",
        subtext: "",
        cta_text: "",
        cta_link: "",
        watermark_text: "",
        right_content_type: "highlight",
        right_image_url: "",
        enabled: true,
      },
    ]);
    setIds((prev) => [...prev, nextBid()]);
  }
  function remove(i: number) {
    onChange(banners.filter((_, idx) => idx !== i));
    setIds((prev) => prev.filter((_, idx) => idx !== i));
  }
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(arrayMove(banners, oldIndex, newIndex));
    setIds((prev) => arrayMove(prev, oldIndex, newIndex));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave();
    setSaving(false);
  }

  return (
    <form
      onSubmit={submit}
      style={{ background: "white", borderRadius: 16, padding: "1.5rem 1.75rem", marginTop: 20, boxShadow: "0 10px 30px rgba(135,56,83,0.08)" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 12 }}>
        <h2 style={{ color: WINE, margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>Rotating Banners</h2>
        {saved && <span style={{ color: "#2e7d4f", fontWeight: 700, fontSize: "0.9rem" }}>Saved ✓</span>}
      </div>
      <p style={{ ...hint, marginBottom: 16 }}>
        Banners auto-rotate every 5 seconds at the top of the Menu page. Drag the ⠿ handle to
        reorder. Only enabled banners are shown.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {banners.map((b, i) => (
              <SortableBannerRow
                key={ids[i]}
                id={ids[i]}
                banner={b}
                position={i + 1}
                onUpdate={(patch) => update(i, patch)}
                onError={onError}
                onDelete={() => remove(i)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {banners.length === 0 && (
        <p style={{ color: BERRY, opacity: 0.7, fontSize: "0.9rem", marginTop: 4 }}>
          No banners yet — add one below.
        </p>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button type="button" onClick={add} style={ghostBtn}>+ Add banner</button>
        <button type="submit" disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function SortableBannerRow({
  id,
  banner,
  position,
  onUpdate,
  onError,
  onDelete,
}: {
  id: string;
  banner: RotatingBanner;
  position: number;
  onUpdate: (patch: Partial<RotatingBanner>) => void;
  onError: (msg: string) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? "rgba(135,56,83,0.05)" : "#FBF4F1",
    border: "1px solid rgba(135,56,83,0.12)",
    borderRadius: 12,
    padding: "12px 14px",
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span
          {...attributes}
          {...listeners}
          title="Drag to reorder"
          style={{ cursor: "grab", touchAction: "none", color: "rgba(135,56,83,0.5)", fontSize: "1.3rem", lineHeight: 1 }}
        >
          ⠿
        </span>
        <span style={{ fontWeight: 700, color: BERRY, fontSize: "0.85rem" }}>#{position}</span>
        <select
          value={banner.type}
          onChange={(e) => onUpdate({ type: e.target.value as BannerType })}
          style={{ ...inputStyle, width: "auto", padding: "6px 10px" }}
        >
          {BANNER_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", color: BERRY, fontWeight: 600, fontSize: "0.85rem" }}>
          <Toggle on={banner.enabled} onClick={() => onUpdate({ enabled: !banner.enabled })} />
          {banner.enabled ? "On" : "Off"}
        </label>
        <button type="button" onClick={onDelete} style={{ ...linkBtn, marginLeft: 4 }} title="Delete banner">
          Delete
        </button>
      </div>
      <input
        style={{ ...inputStyle, marginBottom: 8 }}
        value={banner.heading}
        onChange={(e) => onUpdate({ heading: e.target.value })}
        placeholder="Heading (e.g. Custom Cakes for Every Occasion)"
      />
      <input
        style={{ ...inputStyle, marginBottom: 8 }}
        value={banner.subtext}
        onChange={(e) => onUpdate({ subtext: e.target.value })}
        placeholder="Subtext (optional)"
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          style={{ ...inputStyle, flex: 1, minWidth: 160 }}
          value={banner.cta_text}
          onChange={(e) => onUpdate({ cta_text: e.target.value })}
          placeholder="Button text (e.g. Order Custom Cake)"
        />
        <input
          style={{ ...inputStyle, flex: 1, minWidth: 160 }}
          value={banner.cta_link}
          onChange={(e) => onUpdate({ cta_link: e.target.value })}
          placeholder="Button link (e.g. /contact)"
        />
      </div>

      {/* Right-side content: each banner picks its own, independently. */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed rgba(135,56,83,0.18)" }}>
        <label style={{ display: "block", color: BERRY, fontWeight: 700, fontSize: "0.8rem", marginBottom: 6 }}>
          Right Side Content Type
        </label>
        <select
          value={banner.right_content_type}
          onChange={(e) => onUpdate({ right_content_type: e.target.value as BannerRightContentType })}
          style={{ ...inputStyle, width: "auto", padding: "6px 10px", marginBottom: 8 }}
        >
          {BANNER_RIGHT_CONTENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {banner.right_content_type === "image" ? (
          <ImageUpload
            url={banner.right_image_url}
            onChange={(url) => onUpdate({ right_image_url: url })}
            onError={onError}
          />
        ) : (
          <input
            style={inputStyle}
            value={banner.watermark_text}
            onChange={(e) => onUpdate({ watermark_text: e.target.value })}
            placeholder="Hero highlight text (e.g. 30%, 50%, FREE, Buy 1 Get 1 — leave blank to show product count)"
          />
        )}
      </div>
    </div>
  );
}

// ---------------- Home slider (image list + upload) ----------------
function HomeSliderSection({
  images,
  onChange,
  onError,
  saved,
  onSave,
}: {
  images: string[];
  onChange: (next: string[]) => void;
  onError: (msg: string) => void;
  saved: boolean;
  onSave: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    onError("");
    try {
      const { url } = await adminUpload(file, "/api/admin/site-assets/upload");
      onChange([...images, url]);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function move(i: number, dir: number) {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function remove(i: number) {
    onChange(images.filter((_, idx) => idx !== i));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave();
    setSaving(false);
  }

  return (
    <form
      onSubmit={submit}
      style={{ background: "white", borderRadius: 16, padding: "1.5rem 1.75rem", marginTop: 20, boxShadow: "0 10px 30px rgba(135,56,83,0.08)" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 12 }}>
        <h2 style={{ color: WINE, margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>Home Slider</h2>
        {saved && <span style={{ color: "#2e7d4f", fontWeight: 700, fontSize: "0.9rem" }}>Saved ✓</span>}
      </div>
      <p style={{ ...hint, marginBottom: 16 }}>
        Images shown in the auto-rotating slider on the Home landing page. Upload, reorder or remove.
      </p>

      {images.length === 0 ? (
        <p style={{ color: BERRY, opacity: 0.7, fontSize: "0.9rem" }}>
          No slider images yet — the Home page uses defaults until you add some.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {images.map((url, i) => (
            <div key={`${url}-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, background: "#FBF4F1", border: "1px solid rgba(135,56,83,0.12)", borderRadius: 12, padding: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Slide ${i + 1}`} style={{ width: 84, height: 52, objectFit: "cover", borderRadius: 8 }} />
              <span style={{ fontWeight: 700, color: BERRY, fontSize: "0.85rem" }}>#{i + 1}</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} style={{ ...ghostBtn, padding: "6px 10px", opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === images.length - 1} style={{ ...ghostBtn, padding: "6px 10px", opacity: i === images.length - 1 ? 0.4 : 1 }}>↓</button>
                <button type="button" onClick={() => remove(i)} style={linkBtn}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ ...ghostBtn, display: "inline-block" }}>
          {uploading ? "Uploading…" : "+ Add image"}
          <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} style={{ display: "none" }} />
        </label>
        <button type="submit" disabled={saving || uploading} style={{ ...primaryBtn, opacity: saving || uploading ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      style={{
        width: 46,
        height: 26,
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        background: on ? WINE : "rgba(135,56,83,0.25)",
        position: "relative",
        transition: "background 0.15s",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 23 : 3,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "white",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(135,56,83,0.25)",
  fontSize: "0.95rem",
  color: BERRY,
  outline: "none",
};

const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 70, resize: "vertical" };

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 600,
  color: BERRY,
  marginBottom: 6,
  fontSize: "0.9rem",
};

const primaryBtn: React.CSSProperties = {
  padding: "11px 22px",
  borderRadius: 10,
  border: "none",
  background: WINE,
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 10,
  border: `1px solid ${WINE}`,
  background: "transparent",
  color: WINE,
  fontWeight: 700,
  cursor: "pointer",
};

const linkBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#b03030",
  fontWeight: 700,
  cursor: "pointer",
  padding: "4px 8px",
};

const hint: React.CSSProperties = {
  color: BERRY,
  opacity: 0.6,
  fontSize: "0.85rem",
  marginTop: -4,
  marginBottom: 0,
};

const errorBox: React.CSSProperties = {
  background: "#fde8e8",
  color: "#b03030",
  padding: "10px 14px",
  borderRadius: 10,
  marginTop: 16,
};
