"use client";

// ============================================================
// Le Rasa Bakery — Policy create / edit
// One route for both: `id === "new"` is the create form, any other id
// loads that policy. A full page rather than a modal because the content
// field is a whole document with a live preview beside it.
//
// The Markdown preview renders with react-markdown, which produces React
// elements and does NOT execute raw HTML — so pasting a policy containing
// a <script> tag can never run it, here or on the storefront.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { adminGet, adminSend } from "@/lib/admin-api";
import { useIsMobile } from "@/lib/use-is-mobile";
import { slugify } from "@/lib/slug";
import {
  isValidPolicySlug,
  SLUG_INVALID_MESSAGE,
  SLUG_TAKEN_MESSAGE,
  type Policy,
} from "@/lib/policies";

const WINE = "#873853";
const BERRY = "#5C2A41";

type FormState = {
  title: string;
  short_description: string;
  content: string;
  read_more_text: string;
  slug: string;
  display_order: string;
  enabled: boolean;
};

const EMPTY_FORM: FormState = {
  title: "",
  short_description: "",
  content: "",
  read_more_text: "Read More",
  slug: "",
  display_order: "0",
  enabled: true,
};

export default function PolicyEditPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const isNew = params.id === "new";

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [others, setOthers] = useState<Policy[]>([]); // every OTHER policy, for the slug-uniqueness hint
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // The slug stops tracking the title the moment the admin types in it —
  // and, for an existing policy, it never tracks it at all: silently
  // rewriting a live URL because someone fixed a typo in the title would
  // break every link customers have already bookmarked.
  const [slugTouched, setSlugTouched] = useState(!isNew);

  // Rendered on the client only: on the server there is no window, and
  // guessing the host would risk showing the admin a URL that isn't theirs.
  const [host, setHost] = useState("");
  useEffect(() => setHost(window.location.host), []);

  const load = useCallback(async () => {
    try {
      // Phase 2 exposes a list, not a single-policy GET. The list is a handful
      // of rows, so reading it and picking one is cheaper than adding a route —
      // and it doubles as the set we check the slug's uniqueness against.
      const data = await adminGet<{ policies: Policy[] }>("/api/admin/policies", { force: true });
      const all = data.policies || [];
      setOthers(all.filter((p) => p.id !== params.id));

      if (isNew) {
        // Land at the end of the list by default, not on top of an existing row.
        setForm((f) => ({ ...f, display_order: String(all.length) }));
        return;
      }

      const found = all.find((p) => p.id === params.id);
      if (!found) {
        setError("That policy no longer exists.");
        return;
      }
      setForm({
        title: found.title,
        short_description: found.short_description ?? "",
        content: found.content ?? "",
        read_more_text: found.read_more_text || "Read More",
        slug: found.slug,
        display_order: String(found.display_order ?? 0),
        enabled: found.enabled,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load policy");
    } finally {
      setLoading(false);
    }
  }, [isNew, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-suggested slug, shown while the admin hasn't taken the field over.
  const effectiveSlug = slugTouched ? form.slug : slugify(form.title);

  // Client-side validation MIRRORS the server (lib/policies.ts is the shared
  // source of the rule) — it is a courtesy so the admin sees the problem while
  // typing. The server re-checks both of these; this can never be the only gate.
  const slugError = useMemo(() => {
    if (!effectiveSlug) return "";
    if (!isValidPolicySlug(effectiveSlug)) return SLUG_INVALID_MESSAGE;
    if (others.some((p) => p.slug === effectiveSlug)) return SLUG_TAKEN_MESSAGE;
    return "";
  }, [effectiveSlug, others]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Please enter a title.");
      return;
    }
    if (slugError) {
      setError(slugError);
      return;
    }
    setSaving(true);
    setError("");

    const payload = {
      title: form.title.trim(),
      short_description: form.short_description,
      content: form.content,
      read_more_text: form.read_more_text.trim() || "Read More",
      slug: effectiveSlug, // blank is fine — the server derives it from the title
      display_order: Number(form.display_order) || 0,
      enabled: form.enabled,
    };

    try {
      if (isNew) {
        await adminSend("/api/admin/policies", "POST", payload);
      } else {
        await adminSend(`/api/admin/policies/${params.id}`, "PUT", payload);
      }
      router.push("/admin/dashboard/policies");
    } catch (err) {
      // The server's 400/409 message (e.g. the slug being taken by a policy
      // that appeared since this page loaded) surfaces here verbatim.
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${form.title}"? This cannot be undone.`)) return;
    setError("");
    try {
      await adminSend(`/api/admin/policies/${params.id}`, "DELETE");
      router.push("/admin/dashboard/policies");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  if (loading) {
    return <p style={{ color: BERRY, opacity: 0.7 }}>Loading policy…</p>;
  }

  return (
    <div>
      {/* Preview styling, scoped to .md-preview. Tailwind's reset strips
          headings and lists back to plain text, so without this the preview
          would misrepresent how the storefront actually renders the policy. */}
      <style>{`
        .md-preview h1 { font-size: 1.5rem; font-weight: 800; margin: 0 0 12px; color: ${WINE}; }
        .md-preview h2 { font-size: 1.2rem; font-weight: 800; margin: 18px 0 8px; color: ${WINE}; }
        .md-preview h3 { font-size: 1rem;   font-weight: 700; margin: 16px 0 6px; color: ${WINE}; }
        .md-preview p  { margin: 0 0 10px; line-height: 1.6; }
        .md-preview ul, .md-preview ol { margin: 0 0 10px; padding-left: 22px; list-style: revert; }
        .md-preview li { margin-bottom: 4px; line-height: 1.6; }
        .md-preview a  { color: ${WINE}; text-decoration: underline; }
        .md-preview strong { font-weight: 700; }
        .md-preview em { font-style: italic; }
        .md-preview blockquote { margin: 0 0 10px; padding-left: 12px; border-left: 3px solid rgba(135,56,83,0.25); opacity: 0.85; }
        .md-preview code { background: rgba(135,56,83,0.08); padding: 1px 5px; border-radius: 5px; font-size: 0.88em; }
        .md-preview hr { border: none; border-top: 1px solid rgba(135,56,83,0.15); margin: 16px 0; }
      `}</style>

      <Link href="/admin/dashboard/policies" style={{ color: WINE, fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
        ← Back to policies
      </Link>

      <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, margin: "10px 0 0" }}>
        {isNew ? "New Policy" : "Edit Policy"}
      </h1>
      <p style={{ color: BERRY, opacity: 0.7, marginTop: 4, fontSize: "0.9rem" }}>
        Policies appear in the website footer. Disabled ones are hidden from customers completely.
      </p>

      {error && <p style={errorBox}>{error}</p>}

      <form onSubmit={handleSave} style={{ marginTop: 20, maxWidth: 1100 }}>
        <div style={card}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Title</label>
            <input
              style={inputStyle}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Privacy Policy"
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Short Description</label>
            <textarea
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              value={form.short_description}
              onChange={(e) => setForm({ ...form, short_description: e.target.value })}
              placeholder="One line shown on the policy card, e.g. “How we collect and protect your personal information.”"
            />
          </div>

          <div style={{ display: isMobile ? "block" : "flex", gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1, marginBottom: isMobile ? 14 : 0 }}>
              <label style={labelStyle}>Read More Button Text</label>
              <input
                style={inputStyle}
                value={form.read_more_text}
                onChange={(e) => setForm({ ...form, read_more_text: e.target.value })}
                placeholder="Read More"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Display Order</label>
              <input
                style={inputStyle}
                type="number"
                min="0"
                step="1"
                value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: e.target.value })}
              />
              <p style={hint}>Lower numbers appear first. You can also drag rows on the list page.</p>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>URL Slug</label>
            <input
              style={{ ...inputStyle, ...(slugError ? { borderColor: "#d9534f" } : {}) }}
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setForm({ ...form, slug: e.target.value });
              }}
              placeholder="privacy-policy"
            />
            <p style={hint}>
              {effectiveSlug ? (
                <>
                  This policy will live at{" "}
                  <strong style={{ fontFamily: "monospace" }}>
                    {host}/policies/{effectiveSlug}
                  </strong>
                </>
              ) : (
                "Left blank, this is generated from the title."
              )}
            </p>
            {slugError && <p style={{ ...hint, color: "#d9534f", fontWeight: 600 }}>{slugError}</p>}
            {!isNew && (
              <p style={hint}>
                Changing this changes the policy’s web address — any existing links to the old one
                will stop working.
              </p>
            )}
          </div>

          <label style={checkRow}>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Enabled (visible to customers)
          </label>
        </div>

        {/* Editor + live preview */}
        <div style={{ ...card, marginTop: 18 }}>
          <label style={labelStyle}>Full Policy Content</label>
          <p style={{ ...hint, marginTop: 0, marginBottom: 10 }}>
            Supports Markdown: <code style={codeChip}>**bold**</code>{" "}
            <code style={codeChip}># headings</code> <code style={codeChip}>- lists</code>{" "}
            <code style={codeChip}>[links](url)</code>. Paste your existing policy text here.
          </p>

          <div style={{ display: isMobile ? "block" : "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <textarea
              style={{
                ...inputStyle,
                minHeight: 460,
                resize: "vertical",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.88rem",
                lineHeight: 1.6,
              }}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder={"## Introduction\n\nParagraph text goes here.\n\n- A bullet point\n- Another one"}
            />

            <div style={{ marginTop: isMobile ? 14 : 0 }}>
              <span style={{ ...hint, marginTop: 0, display: "block", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", fontSize: "0.72rem" }}>
                Preview
              </span>
              <div
                className="md-preview"
                style={{
                  minHeight: 460,
                  maxHeight: 620,
                  overflowY: "auto",
                  marginTop: 6,
                  padding: "16px 18px",
                  borderRadius: 10,
                  border: "1px solid rgba(135,56,83,0.25)",
                  background: "#FFFDFD",
                  color: BERRY,
                  fontSize: "0.92rem",
                }}
              >
                {form.content.trim() ? (
                  <ReactMarkdown>{form.content}</ReactMarkdown>
                ) : (
                  <span style={{ opacity: 0.5 }}>Your formatted policy will appear here as you type.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap", marginTop: 18 }}>
          <div>
            {!isNew && (
              <button
                type="button"
                onClick={handleDelete}
                style={{ ...secondaryBtn, borderColor: "#d9534f", color: "#d9534f", ...(isMobile ? { minHeight: 44 } : {}) }}
              >
                Delete policy
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => router.push("/admin/dashboard/policies")}
              style={{ ...secondaryBtn, ...(isMobile ? { minHeight: 44 } : {}) }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ ...primaryBtn, opacity: saving ? 0.6 : 1, ...(isMobile ? { minHeight: 44 } : {}) }}
            >
              {saving ? "Saving…" : isNew ? "Create policy" : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

const card: React.CSSProperties = { background: "white", borderRadius: 16, padding: "1.5rem", boxShadow: "0 10px 30px rgba(135,56,83,0.08)" };
const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(135,56,83,0.25)", fontSize: "0.95rem", color: BERRY, outline: "none" };
const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600, color: BERRY, marginBottom: 6, fontSize: "0.9rem" };
const checkRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, color: BERRY, fontWeight: 600 };
const hint: React.CSSProperties = { color: BERRY, opacity: 0.7, fontSize: "0.82rem", marginTop: 6 };
const codeChip: React.CSSProperties = { background: "rgba(135,56,83,0.08)", padding: "1px 5px", borderRadius: 5 };
const primaryBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: "none", background: WINE, color: "white", fontWeight: 700, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: `1px solid ${WINE}`, background: "transparent", color: WINE, fontWeight: 700, cursor: "pointer" };
const errorBox: React.CSSProperties = { background: "#fde8e8", color: "#b03030", padding: "10px 14px", borderRadius: 10, marginTop: 16 };
