// ============================================================
// Le Rasa Bakery — public site settings reader (SERVER ONLY)
//
// Reads the site_settings singleton with `cache: "no-store"` so admin
// edits show up on the very next request. Server components import this
// directly; client components go through /api/site-settings.
// ============================================================

import "server-only";
import {
  DEFAULT_SETTINGS,
  PUBLIC_SETTINGS_SELECT,
  normaliseSettings,
  type PublicSettings,
} from "@/lib/site-settings";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// The anon key is now the "publishable" key; fall back to the legacy name.
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Read the public site settings, always fresh (never cached). Returns
 * DEFAULT_SETTINGS on any failure so callers never have to handle nulls.
 */
export async function getPublicSettings(): Promise<PublicSettings> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return DEFAULT_SETTINGS;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/site_settings?select=${PUBLIC_SETTINGS_SELECT}&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        // Never cache — admin edits must reflect on the next request.
        cache: "no-store",
      },
    );
    if (!res.ok) return DEFAULT_SETTINGS;
    const rows = (await res.json()) as Record<string, unknown>[];
    return normaliseSettings(rows?.[0] ?? null);
  } catch {
    return DEFAULT_SETTINGS;
  }
}
