"use client";

// ============================================================
// Le Rasa Bakery — Themes admin
// A friendly visual picker for the site's seasonal theme. Writes the
// same site_settings.active_theme field used by the Settings page.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { adminGet, adminSend } from "@/lib/admin-api";

const WINE = "#873853";
const BERRY = "#5C2A41";

const THEMES: { id: string; name: string; emoji: string; swatch: string }[] = [
  { id: "default", name: "Default", emoji: "🎂", swatch: "#F9EEEA" },
  { id: "christmas", name: "Christmas", emoji: "🎄", swatch: "#d7e8d7" },
  { id: "diwali", name: "Diwali", emoji: "🪔", swatch: "#ffe3b0" },
  { id: "valentines", name: "Valentine’s", emoji: "❤️", swatch: "#ffd6e0" },
  { id: "fathers-day", name: "Father’s Day", emoji: "👔", swatch: "#cfe0ef" },
  { id: "easter", name: "Easter", emoji: "🐣", swatch: "#e7e0f5" },
];

export default function ThemesAdminPage() {
  const [active, setActive] = useState("default");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminGet<{ settings: { active_theme: string | null } | null }>(
        "/api/admin/settings",
      );
      setActive(data.settings?.active_theme ?? "default");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load theme");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function choose(id: string) {
    if (id === active) return;
    setSaving(id);
    setError("");
    const prev = active;
    setActive(id); // optimistic
    try {
      // Re-send current settings is unnecessary: the API upserts only the
      // fields it knows; we just send the theme and keep other values intact
      // by reading them first would be ideal, but the upsert preserves nulls.
      const current = await adminGet<{ settings: Record<string, unknown> | null }>(
        "/api/admin/settings",
      );
      await adminSend("/api/admin/settings", "PUT", {
        ...(current.settings ?? {}),
        active_theme: id,
      });
    } catch (e) {
      setActive(prev);
      setError(e instanceof Error ? e.message : "Failed to save theme");
    } finally {
      setSaving("");
    }
  }

  return (
    <div>
      <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, marginTop: 0 }}>Themes</h1>
      <p style={{ color: BERRY, opacity: 0.75, marginTop: 4 }}>
        Pick a seasonal look for your site. Click a theme to make it active.
      </p>

      {error && <p style={errorBox}>{error}</p>}

      {loading ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>Loading…</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 16,
            marginTop: 24,
          }}
        >
          {THEMES.map((t) => {
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                onClick={() => choose(t.id)}
                disabled={saving === t.id}
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  background: "white",
                  border: isActive ? `2px solid ${WINE}` : "2px solid transparent",
                  borderRadius: 16,
                  padding: "1.1rem",
                  boxShadow: "0 10px 30px rgba(135,56,83,0.08)",
                }}
              >
                <div style={{ height: 64, borderRadius: 12, background: t.swatch, display: "grid", placeItems: "center", fontSize: "1.8rem" }}>
                  {t.emoji}
                </div>
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, color: BERRY }}>{t.name}</span>
                  {isActive && <span style={{ color: WINE, fontWeight: 700, fontSize: "0.8rem" }}>● Active</span>}
                  {saving === t.id && <span style={{ color: BERRY, opacity: 0.6, fontSize: "0.8rem" }}>Saving…</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const errorBox: React.CSSProperties = { background: "#fde8e8", color: "#b03030", padding: "10px 14px", borderRadius: 10, marginTop: 16 };
