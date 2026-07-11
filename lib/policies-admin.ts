// ============================================================
// Le Rasa Bakery — SERVER-ONLY admin helpers for the policies CRUD routes.
// ------------------------------------------------------------
// Maps an admin form body -> the `policies` row, and resolves + validates the
// slug (format AND uniqueness) so the routes can answer with a friendly 400/409
// instead of leaking a raw Postgres constraint error at the admin.
//
// Kept out of lib/policies.ts on purpose: that file is pure/client-safe; this
// one takes a SupabaseClient and does I/O. Same split as lib/offers-admin.ts.
// ============================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isValidPolicySlug,
  resolvePolicySlug,
  SLUG_INVALID_MESSAGE,
  SLUG_MISSING_MESSAGE,
  SLUG_TAKEN_MESSAGE,
} from "./policies";

type Body = Record<string, unknown>;

/** Every column the admin panel reads or writes. */
export const POLICY_COLS =
  "id,title,short_description,content,read_more_text,slug,icon_url,display_order,enabled,created_at,updated_at";

function str(v: unknown, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  const s = String(v);
  return s.trim() === "" ? fallback : s;
}

/**
 * The unique-violation Postgres raises if two admins save the same slug in the
 * same instant — after checkSlug() has already looked and found it free.
 *
 * checkSlug() is a read-then-write, so it cannot close that race on its own;
 * the DB's UNIQUE index is what actually guarantees uniqueness. Recognising the
 * code here lets the route turn the loser of that race into the same friendly
 * 409 the pre-check would have given, rather than a 500.
 */
export function isSlugConflict(
  err: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return /policies_slug_key|duplicate key/i.test(err.message ?? "");
}

/** The CHECK constraint firing — only reachable if this file's regex and the
 *  DB's `policies_slug_format` ever drift apart. Mapped so that shows up as a
 *  400 the admin can act on, not an opaque 500. */
export function isSlugFormatViolation(
  err: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!err) return false;
  if (err.code === "23514") return true;
  return /policies_slug_format/i.test(err.message ?? "");
}

export type SlugResult =
  | { ok: true; slug: string }
  | { ok: false; error: string; status: 400 | 409 | 500 };

/**
 * Resolve the slug to store, then validate it — format first, then uniqueness
 * against the table.
 *
 * `excludeId` is the row being updated: without it, every PUT would collide
 * with the policy's own existing slug and no policy could ever be saved twice.
 */
export async function checkSlug(
  supabase: SupabaseClient,
  body: Body,
  excludeId?: string,
): Promise<SlugResult> {
  const slug = resolvePolicySlug(body.slug, body.title);

  // Empty means both the slug field AND the title were blank (or the title was
  // all punctuation, which slugify() reduces to "").
  if (!slug) return { ok: false, error: SLUG_MISSING_MESSAGE, status: 400 };
  if (!isValidPolicySlug(slug)) {
    return { ok: false, error: SLUG_INVALID_MESSAGE, status: 400 };
  }

  let query = supabase.from("policies").select("id").eq("slug", slug);
  if (excludeId) query = query.neq("id", excludeId);

  // maybeSingle(): "no row" is the success case here, not an error.
  const { data, error } = await query.maybeSingle();
  if (error) return { ok: false, error: error.message, status: 500 };
  if (data) return { ok: false, error: SLUG_TAKEN_MESSAGE, status: 409 };

  return { ok: true, slug };
}

/**
 * Admin form body -> a `policies` row.
 *
 * The text columns are NOT NULL DEFAULT '' in the schema, so a missing field
 * becomes '' rather than null. `read_more_text` falls back to the same default
 * the column carries, so a policy can never render a button with no label.
 */
export function buildPolicyRow(body: Body, slug: string): Record<string, unknown> {
  return {
    title: str(body.title),
    short_description: str(body.short_description),
    content: str(body.content),
    read_more_text: str(body.read_more_text, "Read More"),
    slug,
    // Optional: '' means the storefront picks a default Lucide icon instead.
    icon_url: str(body.icon_url),
    display_order: Number(body.display_order) || 0,
    enabled: body.enabled ?? true,
  };
}
