// ============================================================
// Le Rasa Bakery — image upload validation (SERVER ONLY)
// ------------------------------------------------------------
// One shared gate for every endpoint that accepts a file: the admin
// product / site-asset / hero-slider uploads and the public inquiry
// upload. Previously the admin routes accepted ANY file at ANY size and
// stored it with the client's own `Content-Type` in a PUBLIC bucket —
// enough to host arbitrary HTML on the project's supabase.co domain.
//
// Three independent checks, in increasing order of trust:
//
//   1. size            — cheap, and the only bound on storage abuse.
//   2. declared MIME   — `file.type`, which the CLIENT controls, so it is
//                        necessary but never sufficient.
//   3. magic bytes     — the first bytes of the actual content. This is the
//                        real check: a .html renamed to .png with
//                        Content-Type: image/png fails here.
//
// The stored object's extension and contentType are then derived from the
// SNIFFED type, never from the uploaded filename — so a filename can carry
// no path traversal, no double extension, and no script extension.
//
// NEVER import this from a Client Component.
// ============================================================

import "server-only";

/** Canonical extension per accepted image type. */
const TYPE_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
};

/** Accepted MIME types (the keys above, as an array for messages/checks). */
export const ALLOWED_IMAGE_TYPES = Object.keys(TYPE_TO_EXT);

/** Default per-file cap. Matches the inquiry form's existing 8 MB limit. */
export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let s = "";
  for (let i = start; i < start + length && i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

/**
 * Identify an image from its leading bytes. Returns the MIME type, or null when
 * the content is not a recognised image — regardless of what the client claimed.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  // JPEG — FF D8 FF
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG — 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // GIF — "GIF87a" / "GIF89a"
  if (bytes.length > 6 && ascii(bytes, 0, 3) === "GIF") return "image/gif";
  // WEBP — "RIFF" .... "WEBP"
  if (bytes.length > 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  // HEIC / HEIF / AVIF — ISO-BMFF: "ftyp" at offset 4, brand at offset 8.
  if (bytes.length > 12 && ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4).toLowerCase();
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (brand.startsWith("hei") || brand === "mif1" || brand === "msf1") return "image/heic";
    if (brand.startsWith("hev")) return "image/heif";
  }
  return null;
}

export type ValidatedUpload = {
  /** The sniffed (trusted) MIME type to store the object with. */
  contentType: string;
  /** Canonical extension for that type — never taken from the filename. */
  ext: string;
  /** The bytes, already read, so the caller does not re-read the stream. */
  bytes: Uint8Array;
  size: number;
};

export type UploadValidationResult =
  | { ok: true; file: ValidatedUpload }
  | { ok: false; error: string; status: number };

/**
 * Validate an uploaded image. Reads the whole file (bounded by `maxBytes`, and
 * these are small images) so the content can be sniffed, and returns the bytes
 * for the caller to store.
 */
export async function validateImageUpload(
  value: unknown,
  opts: { maxBytes?: number } = {},
): Promise<UploadValidationResult> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  if (!(value instanceof File)) {
    return { ok: false, error: "No file provided.", status: 400 };
  }
  if (value.size === 0) {
    return { ok: false, error: "That file is empty.", status: 400 };
  }
  if (value.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return { ok: false, error: `Each image must be under ${mb} MB.`, status: 413 };
  }

  // The client's own claim. Checked first so an obviously-wrong upload gets a
  // clear message, but it is NOT what we store.
  const declared = (value.type || "").toLowerCase();
  if (declared && !TYPE_TO_EXT[declared]) {
    return {
      ok: false,
      error: "Only JPEG, PNG, WebP, GIF, HEIC or AVIF images are allowed.",
      status: 415,
    };
  }

  const bytes = new Uint8Array(await value.arrayBuffer());

  // Belt and braces: arrayBuffer() is the authoritative size.
  if (bytes.byteLength > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return { ok: false, error: `Each image must be under ${mb} MB.`, status: 413 };
  }

  const sniffed = sniffImageType(bytes);
  if (!sniffed) {
    return {
      ok: false,
      error: "That file is not a valid image.",
      status: 415,
    };
  }

  return {
    ok: true,
    file: {
      contentType: sniffed,
      ext: TYPE_TO_EXT[sniffed],
      bytes,
      size: bytes.byteLength,
    },
  };
}

/**
 * A safe storage object path. The client's filename is never used: the name is
 * generated, and the extension comes from the sniffed type. `prefix` is an
 * optional folder (e.g. "inquiry"), sanitised to a plain slug.
 */
export function safeObjectPath(ext: string, prefix = ""): string {
  const folder = prefix.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}.${ext}`;
  return folder ? `${folder}/${name}` : name;
}
