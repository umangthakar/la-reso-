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
import { adminGet, adminSend, adminUpload } from "@/lib/admin-api";

const WINE = "#873853";
const BERRY = "#5C2A41";

type Announcement = { enabled: boolean; text: string };
type HeroBanner = { enabled: boolean; heading: string; subtext: string };
type WhatsappBar = { enabled: boolean; text: string; number: string };

const HERO_DEFAULT: HeroBanner = {
  enabled: true,
  heading: "Every Bite, Eggless & Divine",
  subtext: "Handcrafted fresh daily — pick your craving",
};

const WHATSAPP_BAR_DEFAULT: WhatsappBar = {
  enabled: true,
  text: "For any question",
  number: "441234567890",
};

type Settings = {
  phone: string;
  email: string;
  whatsapp: string;
  address: string;
  announcement: Announcement;
  hero_banner: HeroBanner;
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
  phone: "",
  email: "",
  whatsapp: "",
  address: "",
  announcement: { enabled: false, text: "" },
  hero_banner: HERO_DEFAULT,
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
      setS({
        ...EMPTY,
        ...Object.fromEntries(
          Object.entries(d).filter(([, v]) => v != null),
        ),
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

      {/* 1. CONTACT DETAILS */}
      <SectionForm
        title="Contact details"
        saved={savedSection === "contact"}
        onSave={() => saveSection("contact", ["phone", "email", "whatsapp", "address"])}
      >
        <Field label="Phone">
          <input style={inputStyle} value={s.phone} onChange={(e) => set("phone", e.target.value)} placeholder="07xxx xxxxxx" />
        </Field>
        <Field label="Email">
          <input style={inputStyle} type="email" value={s.email} onChange={(e) => set("email", e.target.value)} placeholder="hello@lerasa.co.uk" />
        </Field>
        <Field label="WhatsApp number">
          <input style={inputStyle} value={s.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="+44 7xxx xxxxxx" />
        </Field>
        <Field label="Address">
          <textarea style={textareaStyle} value={s.address} onChange={(e) => set("address", e.target.value)} placeholder="Shop address" />
        </Field>
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

      {/* 2b. MENU HERO BANNER */}
      <SectionForm
        title="Hero Banner"
        saved={savedSection === "hero_banner"}
        onSave={() => saveSection("hero_banner", ["hero_banner"])}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, cursor: "pointer" }}>
          <Toggle
            on={s.hero_banner.enabled}
            onClick={() =>
              set("hero_banner", { ...s.hero_banner, enabled: !s.hero_banner.enabled })
            }
          />
          <span style={{ fontWeight: 600, color: BERRY }}>
            {s.hero_banner.enabled ? "Banner is visible" : "Banner is hidden"}
          </span>
        </label>
        <Field label="Main heading">
          <input
            style={inputStyle}
            value={s.hero_banner.heading}
            onChange={(e) => set("hero_banner", { ...s.hero_banner, heading: e.target.value })}
            placeholder="Every Bite, Eggless & Divine"
          />
        </Field>
        <Field label="Subtext">
          <input
            style={inputStyle}
            value={s.hero_banner.subtext}
            onChange={(e) => set("hero_banner", { ...s.hero_banner, subtext: e.target.value })}
            placeholder="Handcrafted fresh daily — pick your craving"
          />
        </Field>
        <p style={hint}>This is the large banner at the top of the Menu page.</p>
      </SectionForm>

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
        <Field label="WhatsApp number">
          <input
            style={inputStyle}
            value={s.whatsapp_bar.number}
            onChange={(e) => set("whatsapp_bar", { ...s.whatsapp_bar, number: e.target.value })}
            placeholder="441234567890"
          />
        </Field>
        <p style={hint}>
          Shows a bar at the top of the Menu page with your text and a bold “Click here” link
          that opens wa.me/&lt;number&gt; in a new tab. Digits only, incl. country code (no +).
        </p>
      </SectionForm>

      {/* 3. SOCIAL MEDIA */}
      <SectionForm
        title="Social media"
        saved={savedSection === "social"}
        onSave={() => saveSection("social", ["instagram_url", "facebook_url", "tiktok_url"])}
      >
        <Field label="Instagram URL">
          <input style={inputStyle} value={s.instagram_url} onChange={(e) => set("instagram_url", e.target.value)} placeholder="https://instagram.com/..." />
        </Field>
        <Field label="Facebook URL">
          <input style={inputStyle} value={s.facebook_url} onChange={(e) => set("facebook_url", e.target.value)} placeholder="https://facebook.com/..." />
        </Field>
        <Field label="TikTok URL">
          <input style={inputStyle} value={s.tiktok_url} onChange={(e) => set("tiktok_url", e.target.value)} placeholder="https://tiktok.com/@..." />
        </Field>
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
    </div>
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
}: {
  title: string;
  saved: boolean;
  onSave: () => void;
  children: React.ReactNode;
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
        {saving ? "Saving…" : "Save"}
      </button>
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
