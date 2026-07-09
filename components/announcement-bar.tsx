// ============================================================
// Le Rasa Bakery — site-wide announcement bar (server component)
// Reads site_settings.announcement ({ enabled, text }) via the shared
// no-store settings reader. Rendered ABOVE the navbar in the root layout.
// Returns null when there's nothing to show.
//
// Offer announcements deliberately do NOT appear here any more — an active
// offer surfaces through <OfferPopup /> on the home page instead. This bar is
// once again purely the manual banner managed from
// /admin/dashboard/settings → Announcement Banner.
// ============================================================

import { getPublicSettings } from "@/lib/site-settings-server";

export async function AnnouncementBar() {
  const { announcement } = await getPublicSettings();

  const text = announcement.enabled ? announcement.text?.trim() || "" : "";
  if (!text) return null;

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
