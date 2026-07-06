// ============================================================
// Le Rasa Bakery — site-wide announcement bar (server component)
// Reads site_settings.announcement ({ enabled, text }) via the shared
// no-store settings reader and, when enabled with text, renders a thin
// bar. Rendered ABOVE the navbar in the root layout. Returns null when
// disabled so nothing else shifts.
//
// Managed from /admin/dashboard/settings → Announcement Banner.
// ============================================================

import { getPublicSettings } from "@/lib/site-settings-server";

export async function AnnouncementBar() {
  const { announcement } = await getPublicSettings();
  const text = announcement.text?.trim();
  if (!announcement.enabled || !text) return null;

  return (
    <div
      role="status"
      style={{
        background: "#873853",
        color: "white",
        textAlign: "center",
        padding: "8px 16px",
        fontSize: "0.9rem",
        fontWeight: 600,
        lineHeight: 1.4,
      }}
    >
      {text}
    </div>
  );
}
