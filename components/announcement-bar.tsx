// ============================================================
// Le Rasa Bakery — site-wide announcement bar (server component)
// Reads site_settings.announcement ({ enabled, text }) via the shared
// no-store settings reader. An active offer's announcement_text takes
// precedence when present; otherwise it falls back to the manual
// site_settings.announcement exactly as before. Rendered ABOVE the navbar
// in the root layout. Returns null when there's nothing to show.
//
// Managed from /admin/dashboard/settings → Announcement Banner, and live
// from any active offer's Storefront content → Announcement bar text.
// ============================================================

import { getPublicSettings, getActiveOfferServer } from "@/lib/site-settings-server";

export async function AnnouncementBar() {
  const [{ announcement }, active] = await Promise.all([
    getPublicSettings(),
    getActiveOfferServer(),
  ]);

  // An active offer's announcement wins; else the manual bar as today.
  const offerText =
    [active.primary, ...active.stackable]
      .map((o) => o?.announcement_text?.trim())
      .find((t) => !!t) || "";
  const manualText = announcement.enabled ? announcement.text?.trim() || "" : "";
  const text = offerText || manualText;
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
