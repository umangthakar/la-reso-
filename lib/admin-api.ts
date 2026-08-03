// ============================================================
// Le Rasa Bakery — client-side admin API helper
// ------------------------------------------------------------
// Thin fetch wrapper used by the admin dashboard pages. Authorisation now
// rides on the signed, httpOnly `admin_session` cookie that
// /api/admin/login sets, so this module holds NO credential at all — it
// just makes sure the cookie is sent (`credentials: "same-origin"`) and
// throws a readable error if something goes wrong, so each page can just
// `await` and show a message.
//
// The cookie is httpOnly by design: this file cannot read it, and neither
// can any injected script. Never import server-only modules here.
// ============================================================

"use client";

/**
 * A failed admin API call. `message` is unchanged from what callers have
 * always received; `fields` carries per-field validation messages when a
 * route returns them alongside the error (currently the WhatsApp config PUT).
 */
export class AdminApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.fields = fields;
  }
}

// ------------------------------------------------------------
// Tiny in-memory GET cache.
// Keyed by URL, lives for the lifetime of the SPA (module stays loaded
// while navigating between dashboard tabs), so revisiting a tab within
// the TTL is instant and doesn't re-hit the network. Any write through
// adminSend() clears the cache so the next read is fresh.
// ------------------------------------------------------------
const GET_CACHE = new Map<string, { ts: number; data: unknown }>();
const CACHE_TTL = 60_000; // 60s

/** Drop all cached GET responses (called after any mutation). */
export function clearAdminCache(): void {
  GET_CACHE.clear();
}

/** GET JSON from an admin API route. Cached for {@link CACHE_TTL}; pass
 *  `{ force: true }` to bypass the cache and refetch. */
export async function adminGet<T>(url: string, opts?: { force?: boolean }): Promise<T> {
  if (!opts?.force) {
    const hit = GET_CACHE.get(url);
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data as T;
  }
  // Never let the browser/HTTP layer serve a stale copy — admin data must be
  // live. (The in-memory GET_CACHE above is the only intended cache; bypass it
  // with { force: true } when freshness matters, e.g. the dashboard.)
  const res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) throw await fail(res, `Request failed (${res.status})`);
  const data = (await res.json()) as T;
  GET_CACHE.set(url, { ts: Date.now(), data });
  return data;
}

/** Send JSON (POST/PUT/PATCH/DELETE) to an admin API route. */
export async function adminSend<T>(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await fail(res, `Request failed (${res.status})`);
  // A write may have changed any list/stat — invalidate the read cache.
  clearAdminCache();
  return res.json() as Promise<T>;
}

/**
 * Upload a single image file; returns its public URL. Defaults to the
 * product-images bucket; pass an endpoint to target another (e.g.
 * "/api/admin/site-assets/upload" for hero/about images).
 *
 * The response type is a parameter so an endpoint that returns more than a URL
 * can be typed at the call site without a second uploader: the hero slider's
 * /api/admin/hero-slider/upload also returns the DB row it created. It defaults
 * to { url } — every existing caller is unchanged, and nothing about the
 * request itself differs.
 *
 * `fields` adds extra form fields beside the file, for an endpoint that creates
 * a row as well as writing an object and therefore needs more than the bytes —
 * the hero slider sends the product the image is linked to. Omitted by every
 * other caller, which then sends exactly the request it always did.
 */
export async function adminUpload<T = { url: string }>(
  file: File,
  endpoint = "/api/admin/products/upload",
  fields?: Record<string, string>,
): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  for (const [key, value] of Object.entries(fields ?? {})) form.append(key, value);
  const res = await fetch(endpoint, {
    method: "POST",
    // Do NOT set Content-Type; the browser sets the multipart boundary.
    credentials: "same-origin",
    body: form,
  });
  if (!res.ok) throw await fail(res, "Image upload failed");
  return res.json() as Promise<T>;
}

/** Build the error for a non-ok response, preserving the caller's fallback
 *  message and capturing any per-field validation detail. */
async function fail(res: Response, fallback: string): Promise<AdminApiError> {
  let message: string | null = null;
  let fields: Record<string, string> | undefined;
  try {
    const data = await res.json();
    if (typeof data?.error === "string") message = data.error;
    if (data?.fields && typeof data.fields === "object") {
      fields = data.fields as Record<string, string>;
    }
  } catch {
    // Non-JSON body — fall through to the caller's default message.
  }
  return new AdminApiError(message || fallback, res.status, fields);
}
