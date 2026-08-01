// ============================================================
// Le Rasa Bakery — product image Storage helpers (server-side).
// ------------------------------------------------------------
// Where a product image is written (the upload route) and where it is deleted
// from (the category cascade delete) now share ONE definition of the bucket
// and ONE way of turning a stored public url back into an object key, so the
// two can never drift apart. Same shape as the hero slider's
// heroSliderStoragePath — the pattern this follows deliberately.
//
// Server-only (used with the service-role client). Never import from a
// "use client" module.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

/** The public bucket every product image is uploaded to. */
export const PRODUCT_IMAGE_BUCKET = "product-images";

/**
 * The Storage object key for a product image url, or null when the url isn't
 * one of ours.
 *
 * Deliberately strict: it requires the Supabase public-object prefix AND the
 * exact bucket, and returns null for anything else — an external url, a
 * hand-edited row, an object in another bucket. Null means "there is no file of
 * ours here", which callers must treat as nothing to delete, never as a licence
 * to guess a key. Product images are stored flat (`<timestamp>-<rand>.<ext>`,
 * see the upload route), so the key is simply whatever follows the bucket.
 */
export function productImageStoragePath(imageUrl: string): string | null {
  const url = (imageUrl ?? "").trim();
  if (!url) return null;
  const marker = `/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  // Drop any ?query / #fragment before using the remainder as a key.
  const key = decodeURIComponent(url.slice(at + marker.length).split(/[?#]/)[0]);
  if (!key || key.includes("..")) return null;
  return key;
}

/** What a bulk removal actually managed to do. */
export type ImageRemoval = {
  /** Object keys Storage confirmed removed. */
  removed: string[];
  /** Object keys still in the bucket, with why — the admin has to clear these. */
  failed: { path: string; message: string }[];
};

/**
 * Remove product image objects by their public urls. Urls that aren't ours are
 * skipped silently (nothing of ours to delete).
 *
 * This runs AFTER the database transaction has committed, which is the right
 * way round: the rows are what the site can see, so the worst case here is a
 * file outliving its row — a tidy-up job — whereas deleting files first would
 * leave live products pointing at urls that 404. A file that was already gone
 * is not a failure: Storage's remove() does not error on a missing key.
 *
 * Never throws — a Storage outage must not turn a completed delete into an
 * error the admin reads as "nothing happened". Failures come back in `failed`
 * so the caller can name the files that need clearing by hand.
 */
export async function removeProductImages(
  supabase: SupabaseClient,
  imageUrls: string[],
): Promise<ImageRemoval> {
  const paths = Array.from(
    new Set(
      (Array.isArray(imageUrls) ? imageUrls : [])
        .map((url) => productImageStoragePath(String(url ?? "")))
        .filter((p): p is string => !!p),
    ),
  );

  const result: ImageRemoval = { removed: [], failed: [] };
  if (paths.length === 0) return result;

  // Storage caps how much one remove() call will take, so go in batches; a
  // failed batch only costs that batch.
  const BATCH = 100;
  for (let i = 0; i < paths.length; i += BATCH) {
    const batch = paths.slice(i, i + BATCH);
    try {
      const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(batch);
      if (error) {
        console.error("[product-storage] remove failed:", error.message);
        for (const path of batch) result.failed.push({ path, message: error.message });
      } else {
        result.removed.push(...batch);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Storage delete failed";
      console.error("[product-storage] remove threw:", message);
      for (const path of batch) result.failed.push({ path, message });
    }
  }
  return result;
}
