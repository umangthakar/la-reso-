// ============================================================
// Le Rasa Bakery — site-wide announcement bar (server component)
// Reads site_settings.announcement ({ enabled, text }) and, when
// enabled with text, renders a thin bar. Rendered ABOVE the navbar in
// the root layout. Returns null when disabled so nothing else shifts.
//
// Managed from /admin/dashboard/settings → Announcement Banner.
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// The anon key is now the "publishable" key; fall back to the legacy name.
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type Announcement = { enabled?: boolean; text?: string };

async function getAnnouncement(): Promise<Announcement | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/site_settings?select=announcement&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        // Re-check periodically so admin edits show up without a redeploy.
        next: { revalidate: 30 },
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { announcement?: Announcement }[];
    return rows?.[0]?.announcement ?? null;
  } catch {
    return null;
  }
}

export async function AnnouncementBar() {
  const a = await getAnnouncement();
  const text = a?.text?.trim();
  if (!a?.enabled || !text) return null;

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
