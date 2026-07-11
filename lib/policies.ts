// ============================================================
// Le Rasa Bakery — policy types + slug rules. PURE and CLIENT-SAFE.
// ------------------------------------------------------------
// No I/O and no server-only imports, so the admin UI (Phase 3) and the
// storefront can both import this. The DB-touching admin helpers live in
// lib/policies-admin.ts, the same split as lib/offers.ts / lib/offers-admin.ts.
// ============================================================

import { slugify } from "./slug";

/** A full policy row, as stored by supabase/sql/19_policies.sql. */
export type Policy = {
  id: string;
  title: string;
  short_description: string;
  content: string; // Markdown source
  read_more_text: string;
  slug: string;
  display_order: number;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

/**
 * What the storefront footer / policy index needs: everything EXCEPT `content`.
 * The footer renders on every page, so shipping the full Markdown of every
 * policy in that payload would be wasted bytes on every single request.
 */
export type PolicySummary = Pick<
  Policy,
  "id" | "title" | "short_description" | "read_more_text" | "slug"
>;

/** Columns behind {@link PolicySummary}, for the public list query. */
export const POLICY_SUMMARY_COLS = "id,title,short_description,read_more_text,slug";

/**
 * The slug shape, mirroring the `policies_slug_format` CHECK in
 * supabase/sql/19_policies.sql: lowercase alphanumerics in hyphen-separated
 * groups — no leading, trailing or doubled hyphens, and never empty.
 *
 * Kept in sync with the DB constraint ON PURPOSE. The constraint is the real
 * guarantee (it also catches a hand-edit in the Supabase table editor); this
 * copy exists so the admin gets a friendly message instead of a raw Postgres
 * error. If you change one, change the other.
 */
export const POLICY_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidPolicySlug(slug: string): boolean {
  return POLICY_SLUG_PATTERN.test(slug);
}

/**
 * The slug to save, given what the admin typed.
 *
 * A blank slug field is a convenience, not an error: derive one from the title.
 * Anything the admin DID type wins — slugify() is only ever a default here, so
 * an admin who wants `terms` instead of `terms-and-conditions` gets it.
 *
 * Only whitespace-trimming and lower-casing are applied to a typed slug; it is
 * deliberately NOT slugified, because silently rewriting the URL someone just
 * typed is worse than telling them it's invalid. Validation is the caller's job
 * (see isValidPolicySlug) — this returns exactly what would be stored, valid or
 * not.
 */
export function resolvePolicySlug(rawSlug: unknown, title: unknown): string {
  const typed = typeof rawSlug === "string" ? rawSlug.trim().toLowerCase() : "";
  if (typed) return typed;
  return slugify(typeof title === "string" ? title : "");
}

export const SLUG_TAKEN_MESSAGE = "This URL slug is already used by another policy.";
export const SLUG_INVALID_MESSAGE =
  "The URL slug may only contain lowercase letters, numbers and single hyphens (e.g. privacy-policy).";
export const SLUG_MISSING_MESSAGE =
  "A URL slug is required — add one, or give the policy a title to derive it from.";
