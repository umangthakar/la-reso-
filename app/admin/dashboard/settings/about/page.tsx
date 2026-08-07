"use client";

// ============================================================
// Le Rasa — Content & Settings → About Us
// ------------------------------------------------------------
// The CMS for /about. Every string the page renders in its hero and story
// sections is edited here, and the story photo is uploaded, replaced and
// removed here. Saved as one object to site_settings.about_page through
// /api/admin/about, which also cleans up the replaced photo and revalidates the
// page (see that route's header).
//
// A NESTED ROUTE UNDER settings/, like the WhatsApp page: it belongs to Content
// & Settings, but it owns a whole page's worth of fields and its own preview,
// which would bury the eight sections already on the parent page.
//
// Reuses the panel's existing building blocks rather than introducing any:
// adminGet/adminSend for the calls, ImageDropzone for the upload (drag & drop,
// live preview, client-side validation, and the same admin-gated endpoint every
// other admin image uses), and the parent page's inline-style vocabulary for
// the form chrome.
//
// BLANK MEANS "USE THE BUILT-IN WORDING". Each field's placeholder is the copy
// that ships in the code, and clearing a field restores it — so the page can
// never end up with an empty heading, and the defaults keep tracking the code
// instead of being frozen into the row on first save.
//
// Requires supabase/sql/47_about_page.sql.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminGet, adminSend } from "@/lib/admin-api";
import { ImageDropzone } from "@/components/admin/image-dropzone";
import {
  ABOUT_DEFAULT,
  ABOUT_IMAGE_ASPECT,
  ABOUT_IMAGE_FOLDER,
  ABOUT_IMAGE_MAX_BYTES,
  ABOUT_IMAGE_RECOMMENDED,
  ABOUT_IMAGE_TYPES,
  ABOUT_LIMITS,
  MAX_PARAGRAPHS,
  normaliseAboutContent,
  type AboutContent,
} from "@/lib/about-content";

const WINE = "#873853";
const BERRY = "#5C2A41";

/** An empty form: nothing overridden, so every field shows its placeholder. */
const EMPTY: AboutContent = {
  hero_eyebrow: "",
  hero_heading: "",
  hero_description: "",
  badge: "",
  heading: "",
  paragraphs: [],
  image_url: "",
  image_alt: "",
};

export default function AboutAdminPage() {
  const [form, setForm] = useState<AboutContent>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [saved, setSaved] = useState(false);

  // Photos uploaded during THIS edit. The bytes are in the bucket the moment
  // the dropzone finishes, but only one of them can end up in the row — the
  // rest are handed to the save so the server can delete them. Without this,
  // uploading three photos and saving the third would leave two paid-for files
  // that nothing points at and nothing can find.
  const [uploaded, setUploaded] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminGet<{ about: Partial<AboutContent> | null }>(
        "/api/admin/about",
        { force: true },
      );
      const a = (data.about ?? {}) as Partial<AboutContent>;
      setForm({
        ...EMPTY,
        ...a,
        paragraphs: Array.isArray(a.paragraphs) ? a.paragraphs : [],
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load the About page content. The page itself is unaffected.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof AboutContent>(key: K, value: AboutContent[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  function setParagraph(index: number, value: string) {
    setForm((f) => {
      const next = Array.from({ length: MAX_PARAGRAPHS }, (_, i) => f.paragraphs[i] ?? "");
      next[index] = value;
      return { ...f, paragraphs: next };
    });
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setWarning("");
    setSaved(false);
    setSaving(true);
    try {
      const payload: AboutContent = {
        ...form,
        // Blank slots are dropped, so two paragraphs publish as two — but the
        // order of the ones that remain is the order they were typed in.
        paragraphs: form.paragraphs.map((p) => p.trim()).filter((p) => p !== ""),
      };
      const res = await adminSend<{ about: AboutContent; warning?: string }>(
        "/api/admin/about",
        "PUT",
        {
          about: payload,
          // Everything uploaded this session except what is actually being
          // saved. The server re-checks each one before deleting.
          discarded_image_urls: uploaded.filter((url) => url !== payload.image_url),
        },
      );
      // Settle on what the database actually holds, rather than trusting the
      // form — the server trims and caps, and the admin should see that.
      setForm({ ...EMPTY, ...res.about });
      setUploaded([]);
      setSaved(true);
      if (res.warning) setWarning(res.warning);
    } catch (err) {
      // The form state is untouched, so nothing typed is lost on a failure.
      setError(err instanceof Error ? err.message : "Failed to save the About page.");
    } finally {
      setSaving(false);
    }
  }

  // What the storefront would render right now — the same function the page
  // itself uses, so the preview cannot drift from the real fallback rules.
  const preview = normaliseAboutContent(form);
  const busy = saving || uploading;

  if (loading) {
    return (
      <div style={{ maxWidth: 900 }}>
        <Header />
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <Header />

      {error && <p style={errorBox}>{error}</p>}
      {warning && <p style={warningBox}>{warning}</p>}

      <form onSubmit={save}>
        {/* ---- TOP HERO ---- */}
        <Section title="Top hero section">
          <p style={{ ...hint, marginBottom: 16 }}>
            The banner across the top of the About page.
          </p>
          <Field
            label="Small badge"
            value={form.hero_eyebrow}
            max={ABOUT_LIMITS.hero_eyebrow}
          >
            <input
              style={inputStyle}
              maxLength={ABOUT_LIMITS.hero_eyebrow}
              value={form.hero_eyebrow}
              onChange={(e) => set("hero_eyebrow", e.target.value)}
              placeholder={ABOUT_DEFAULT.hero_eyebrow}
            />
          </Field>
          <Field
            label="Hero heading"
            value={form.hero_heading}
            max={ABOUT_LIMITS.hero_heading}
          >
            <input
              style={inputStyle}
              maxLength={ABOUT_LIMITS.hero_heading}
              value={form.hero_heading}
              onChange={(e) => set("hero_heading", e.target.value)}
              placeholder={ABOUT_DEFAULT.hero_heading}
            />
          </Field>
          <Field
            label="Hero description"
            value={form.hero_description}
            max={ABOUT_LIMITS.hero_description}
          >
            <textarea
              style={{ ...textareaStyle, minHeight: 80 }}
              maxLength={ABOUT_LIMITS.hero_description}
              value={form.hero_description}
              onChange={(e) => set("hero_description", e.target.value)}
              placeholder={ABOUT_DEFAULT.hero_description}
            />
          </Field>
        </Section>

        {/* ---- STORY PHOTO ---- */}
        <Section title="Story photo">
          <p style={{ ...hint, marginBottom: 16 }}>
            The portrait photo beside your story. Drag an image in or choose a
            file — it uploads straight away, and the photo it replaces is deleted
            from storage when you save. Remove it and the page falls back to the
            built-in photo, so the layout is never left with a gap.
          </p>
          <ImageDropzone
            value={form.image_url}
            onChange={(url) => set("image_url", url)}
            onUploaded={(url) => setUploaded((prev) => [...prev, url])}
            onBusyChange={setUploading}
            disabled={saving}
            accept={ABOUT_IMAGE_TYPES}
            maxBytes={ABOUT_IMAGE_MAX_BYTES}
            prefix={ABOUT_IMAGE_FOLDER}
            label="About page photo"
            previewAspect={ABOUT_IMAGE_ASPECT}
            recommendedWidth={ABOUT_IMAGE_RECOMMENDED.width}
            recommendedHeight={ABOUT_IMAGE_RECOMMENDED.height}
          />
          <div style={{ marginTop: 16 }}>
            <Field
              label="Photo description (alt text)"
              value={form.image_alt}
              max={ABOUT_LIMITS.image_alt}
            >
              <input
                style={inputStyle}
                maxLength={ABOUT_LIMITS.image_alt}
                value={form.image_alt}
                onChange={(e) => set("image_alt", e.target.value)}
                placeholder={ABOUT_DEFAULT.image_alt}
              />
              <p style={{ ...hint, marginTop: 6 }}>
                Read aloud by screen readers and shown if the photo fails to
                load. Describe what is in the picture.
              </p>
            </Field>
          </div>
        </Section>

        {/* ---- STORY ---- */}
        <Section title="Story section">
          <p style={{ ...hint, marginBottom: 16 }}>
            The wording beside the photo. Leave a paragraph blank to publish
            fewer than {MAX_PARAGRAPHS} — the spacing adjusts on its own.
          </p>
          <Field label="Small badge" value={form.badge} max={ABOUT_LIMITS.badge}>
            <input
              style={inputStyle}
              maxLength={ABOUT_LIMITS.badge}
              value={form.badge}
              onChange={(e) => set("badge", e.target.value)}
              placeholder={ABOUT_DEFAULT.badge}
            />
          </Field>
          <Field label="Main heading" value={form.heading} max={ABOUT_LIMITS.heading}>
            <input
              style={inputStyle}
              maxLength={ABOUT_LIMITS.heading}
              value={form.heading}
              onChange={(e) => set("heading", e.target.value)}
              placeholder={ABOUT_DEFAULT.heading}
            />
          </Field>
          {Array.from({ length: MAX_PARAGRAPHS }, (_, i) => (
            <Field
              key={i}
              label={`Paragraph ${i + 1}`}
              value={form.paragraphs[i] ?? ""}
              max={ABOUT_LIMITS.paragraph}
            >
              <textarea
                style={{ ...textareaStyle, minHeight: 110 }}
                maxLength={ABOUT_LIMITS.paragraph}
                value={form.paragraphs[i] ?? ""}
                onChange={(e) => setParagraph(i, e.target.value)}
                placeholder={ABOUT_DEFAULT.paragraphs[i]}
              />
            </Field>
          ))}
        </Section>

        {/* ---- PREVIEW ---- */}
        <Section title="Preview">
          <p style={{ ...hint, marginBottom: 16 }}>
            Exactly what a customer sees, on both screen sizes. Blank fields show
            the built-in wording, which is what the live page would use.
          </p>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            <PreviewFrame title="Desktop" width={480}>
              <AboutPreview content={preview} layout="desktop" />
            </PreviewFrame>
            <PreviewFrame title="Mobile" width={260}>
              <AboutPreview content={preview} layout="mobile" />
            </PreviewFrame>
          </div>
        </Section>

        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 20,
          }}
        >
          <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save About page"}
          </button>
          <Link href="/about" target="_blank" style={ghostLink}>
            View the live page ↗
          </Link>
          {uploading && (
            <span style={{ color: BERRY, opacity: 0.7, fontSize: "0.88rem" }}>
              Waiting for the photo to finish uploading…
            </span>
          )}
          {saved && !uploading && (
            <span style={{ color: "#2e7d4f", fontWeight: 700, fontSize: "0.9rem" }}>
              Saved ✓ — the About page is already showing this.
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function Header() {
  return (
    <>
      <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, marginTop: 0 }}>
        About Us
      </h1>
      <p style={{ color: BERRY, opacity: 0.75, marginTop: 4, maxWidth: 620 }}>
        Everything on the public <strong>About</strong> page — the headings, your
        story and the photo. Leave any field blank to keep the wording the site
        ships with. Saving updates the page immediately.
      </p>
    </>
  );
}

// ------------------------------------------------------------
// Live preview of the storefront page. Mirrors app/about/page.tsx: the same
// order (hero, then photo + story), the same 4:5 portrait frame, the same
// two-column-on-desktop / stacked-on-mobile split, and the same palette from
// tailwind.config.ts. Scaled down, so it is a faithful composition rather than
// a pixel-exact screenshot.
// ------------------------------------------------------------
function AboutPreview({
  content,
  layout,
}: {
  content: AboutContent;
  layout: "desktop" | "mobile";
}) {
  const desktop = layout === "desktop";
  return (
    <div style={{ background: "#FDF8F6", padding: desktop ? "22px 20px" : "16px 12px" }}>
      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: desktop ? 26 : 20 }}>
        <span style={pill}>{content.hero_eyebrow}</span>
        <h2
          style={{
            color: "#612437",
            fontWeight: 600,
            fontSize: desktop ? "1.5rem" : "1.05rem",
            lineHeight: 1.2,
            margin: "10px auto 0",
            maxWidth: desktop ? 380 : 220,
          }}
        >
          {content.hero_heading}
        </h2>
        <p
          style={{
            color: "#8A5563",
            fontSize: desktop ? "0.82rem" : "0.72rem",
            lineHeight: 1.5,
            margin: "8px auto 0",
            maxWidth: desktop ? 340 : 210,
          }}
        >
          {content.hero_description}
        </p>
      </div>

      {/* Story: photo + copy */}
      <div
        style={{
          display: "flex",
          flexDirection: desktop ? "row" : "column",
          gap: desktop ? 22 : 14,
          alignItems: desktop ? "center" : "stretch",
        }}
      >
        <div
          style={{
            flex: desktop ? "0 0 40%" : undefined,
            width: desktop ? undefined : "100%",
            aspectRatio: ABOUT_IMAGE_ASPECT,
            borderRadius: 18,
            overflow: "hidden",
            background: "#F2DCD6",
            boxShadow: "0 12px 30px rgba(97,36,55,0.14)",
          }}
        >
          {/* A plain <img>, not next/image: the URL can point at any host the
              admin has configured, which next/image would refuse. Eagerly
              loaded — this is the whole point of the panel, and there are two
              of them, so deferring it would show the admin an empty frame.
              eslint-disable for the same reason. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={content.image_url}
            alt={content.image_alt}
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={pill}>{content.badge}</span>
          <h3
            style={{
              color: "#612437",
              fontWeight: 600,
              fontSize: desktop ? "1.15rem" : "0.98rem",
              lineHeight: 1.2,
              margin: "10px 0 0",
            }}
          >
            {content.heading}
          </h3>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {content.paragraphs.map((p, i) => (
              <p
                key={i}
                style={{
                  color: "#8A5563",
                  fontSize: desktop ? "0.76rem" : "0.7rem",
                  lineHeight: 1.55,
                  margin: 0,
                  whiteSpace: "pre-line",
                }}
              >
                {p}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewFrame({
  title,
  width,
  children,
}: {
  title: string;
  width: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ flex: `0 1 ${width}px`, minWidth: 240 }}>
      <p
        style={{
          color: BERRY,
          fontWeight: 700,
          fontSize: "0.8rem",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          margin: "0 0 8px",
        }}
      >
        {title}
      </p>
      <div
        style={{
          border: "1px solid rgba(135,56,83,0.18)",
          borderRadius: 14,
          overflow: "hidden",
          background: "#FDF8F6",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------- presentational helpers ----------------
// Same vocabulary as the parent Content & Settings page, so the two read as one
// panel. Kept local for the same reason it is local there: these are style
// objects, not components.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "white",
        borderRadius: 16,
        padding: "1.5rem 1.75rem",
        marginTop: 20,
        boxShadow: "0 10px 30px rgba(135,56,83,0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
          gap: 12,
        }}
      >
        <h2 style={{ color: WINE, margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

/** A labelled field with a live character count, so the cap that protects the
 *  page's layout is visible while typing rather than only on submit. */
function Field({
  label,
  value,
  max,
  children,
}: {
  label: string;
  value?: string;
  max?: number;
  children: React.ReactNode;
}) {
  const used = (value ?? "").length;
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <label style={labelStyle}>{label}</label>
        {typeof max === "number" && (
          <span
            style={{
              color: used >= max ? "#b03030" : BERRY,
              opacity: used >= max ? 1 : 0.5,
              fontSize: "0.75rem",
              fontWeight: used >= max ? 700 : 500,
            }}
          >
            {used}/{max}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

const pill: React.CSSProperties = {
  display: "inline-block",
  background: "rgba(234,210,210,0.7)",
  color: "#743249",
  borderRadius: 999,
  padding: "4px 12px",
  fontSize: "0.6rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.16em",
};

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

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 70,
  resize: "vertical",
  fontFamily: "inherit",
  lineHeight: 1.5,
};

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

const ghostLink: React.CSSProperties = {
  color: WINE,
  fontWeight: 700,
  fontSize: "0.9rem",
  textDecoration: "none",
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

const warningBox: React.CSSProperties = {
  background: "#fdf3e2",
  color: "#9a6212",
  padding: "10px 14px",
  borderRadius: 10,
  marginTop: 16,
};
