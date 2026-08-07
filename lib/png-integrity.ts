// ============================================================
// Le Rasa — PNG integrity check (SERVER ONLY)
// ------------------------------------------------------------
// Proves that a byte array is a COMPLETE, decodable PNG, using nothing but
// Node's own core `zlib`. No native addon, no image library.
//
// WHY THIS EXISTS. The hero-slider upload route used to run `sharp(bytes)
// .metadata()` and `sharp(bytes).png().toBuffer()` for exactly this check.
// sharp is a native module: it dlopen()s libvips at runtime, and on Vercel's
// linux-x64 serverless runtime that load failed —
//
//     Could not load the "sharp" module using the linux-x64 runtime
//     ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3
//
// — which turned every hero PNG upload into a 500. Nothing in this codebase
// resizes, re-encodes or compresses an image, so a 30 MB native imaging stack
// was being shipped to production to answer one question: "do these bytes
// really decode?". That question is answerable from the PNG spec directly, and
// the answer below is a plain JavaScript one that cannot fail to load on any
// platform.
//
// WHAT IT ACTUALLY VERIFIES — four independent layers, cheapest first:
//
//   1. the 8-byte signature;
//   2. the chunk stream — every chunk's declared length must fit inside the
//      file, the first must be IHDR, and IEND must be reached. A file
//      truncated mid-upload runs off the end here;
//   3. the CRC-32 the spec stores after every chunk. This is a real
//      per-chunk integrity check, and it catches a corrupt IDAT — the case
//      the old `.toBuffer()` call was there for. (libvips does not verify
//      these by default, so this is if anything stricter than sharp was.)
//   4. the zlib stream itself: the concatenated IDAT data is inflated in
//      full, so a broken compressed stream or a bad Adler-32 fails, and the
//      inflated size is compared against the size IHDR implies — a PNG whose
//      pixel data stops early is rejected even if its chunks are well-formed.
//
// The inflate is STREAMED and discarded, never buffered: a 10 MB IDAT can
// legitimately expand to hundreds of MB of raw pixels, and a malicious one to
// far more. Only a running byte count is kept, and it is capped (see
// `maxPixels` / `maxOutputBytes`), so a decompression bomb is cut off in
// milliseconds instead of exhausting the function's memory or its timeout.
//
// NEVER import this from a Client Component — the browser has no `node:zlib`.
// The header-only rules that both sides share live in lib/hero-slider.ts.
// ============================================================

import "server-only";
import { createInflate } from "node:zlib";

/**
 * Why a file was rejected, or null when it is a valid PNG.
 *
 *   notPng         — no PNG signature. Not this format at all.
 *   corrupt        — a PNG that does not survive the checks above: truncated,
 *                    a failed CRC, an unreadable IHDR, or pixel data that does
 *                    not inflate to the size the header promised.
 *   tooManyPixels  — well-formed, but declares more pixels than we are willing
 *                    to spend CPU inflating. Distinct from `corrupt` because
 *                    nothing is wrong with the file — it is simply too big.
 */
export type PngIntegrityFailure = "notPng" | "corrupt" | "tooManyPixels";

/** Conservative default pixel ceiling (~40 MP, i.e. 8000×5000). Callers with
 *  their own rule pass `maxPixels`; this is the backstop for those that don't. */
export const PNG_DEFAULT_MAX_PIXELS = 40_000_000;

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Samples per pixel for each PNG colour type. Indices not listed are invalid
 *  colour types, which is how an unknown one is rejected. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Bit depths the spec permits for each colour type. */
const BIT_DEPTHS: Record<number, number[]> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

// ------------------------------------------------------------
// CRC-32 (the polynomial the PNG spec fixes, 0xEDB88320 reflected)
// ------------------------------------------------------------
// Table-driven, built once per process. Over a 10 MB file this is a single
// linear pass measured in tens of milliseconds.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 of bytes[start, end). */
function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Big-endian uint32 at `at`. The only integer encoding PNG uses. */
function readU32(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
  );
}

/** The 4-character chunk type at `at`. */
function chunkType(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

type Ihdr = {
  width: number;
  height: number;
  bitDepth: number;
  colourType: number;
  interlace: number;
};

/** Parse the 13-byte IHDR payload, or null when any field is out of spec. */
function parseIhdr(bytes: Uint8Array, at: number): Ihdr | null {
  const width = readU32(bytes, at);
  const height = readU32(bytes, at + 4);
  const bitDepth = bytes[at + 8];
  const colourType = bytes[at + 9];
  const compression = bytes[at + 10];
  const filter = bytes[at + 11];
  const interlace = bytes[at + 12];

  if (width === 0 || height === 0) return null;
  if (!(colourType in CHANNELS)) return null;
  if (!BIT_DEPTHS[colourType].includes(bitDepth)) return null;
  // The spec defines exactly one compression method and one filter method, and
  // interlace is Adam7 or nothing. Anything else is not a PNG we can reason about.
  if (compression !== 0 || filter !== 0) return null;
  if (interlace !== 0 && interlace !== 1) return null;

  return { width, height, bitDepth, colourType, interlace };
}

/**
 * How many bytes the inflated IDAT stream must contain for this header.
 *
 * Each scanline is one filter byte plus its packed samples; Adam7 splits the
 * image into seven sub-images, each with its own scanlines, so the interlaced
 * total is the sum over the passes rather than a single rectangle.
 */
function expectedRawBytes(h: Ihdr): number {
  const bitsPerPixel = CHANNELS[h.colourType] * h.bitDepth;
  const rowBytes = (width: number) => Math.ceil((width * bitsPerPixel) / 8);

  if (h.interlace === 0) return h.height * (1 + rowBytes(h.width));

  const X_START = [0, 4, 0, 2, 0, 1, 0];
  const Y_START = [0, 0, 4, 0, 2, 0, 1];
  const X_STEP = [8, 8, 4, 4, 2, 2, 1];
  const Y_STEP = [8, 8, 8, 4, 4, 2, 2];

  let total = 0;
  for (let pass = 0; pass < 7; pass++) {
    const passWidth = Math.ceil((h.width - X_START[pass]) / X_STEP[pass]);
    const passHeight = Math.ceil((h.height - Y_START[pass]) / Y_STEP[pass]);
    // A pass can be empty on a small image — it contributes nothing, not a
    // negative row count.
    if (passWidth > 0 && passHeight > 0) total += passHeight * (1 + rowBytes(passWidth));
  }
  return total;
}

/**
 * Inflate `data`, counting the output and throwing it away.
 *
 * Returns the inflated byte count, or null when the stream is not valid zlib,
 * ends early, fails its Adler-32, or would exceed `limit`. Nothing larger than
 * one zlib output chunk is ever held in memory.
 */
function inflatedLength(data: Uint8Array, limit: number): Promise<number | null> {
  return new Promise((resolve) => {
    const stream = createInflate();
    let total = 0;
    let settled = false;
    const settle = (value: number | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    stream.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > limit) {
        // A decompression bomb, or simply an image far larger than it claims.
        // Stop pulling on it immediately; destroy() emits an error we ignore
        // because `settled` is already true.
        stream.destroy();
        settle(null);
      }
    });
    stream.on("end", () => settle(total));
    stream.on("error", () => settle(null));
    stream.end(data);
  });
}

/**
 * Validate a PNG end to end. Returns null when the bytes are a complete,
 * decodable PNG, or the reason they are not.
 *
 * `maxPixels` bounds the work this will do before giving up — see
 * {@link PNG_DEFAULT_MAX_PIXELS}. It is checked from the header, before a
 * single byte is inflated.
 */
export async function checkPngIntegrity(
  bytes: Uint8Array,
  opts: { maxPixels?: number } = {},
): Promise<PngIntegrityFailure | null> {
  const maxPixels = opts.maxPixels ?? PNG_DEFAULT_MAX_PIXELS;

  if (bytes.length < SIGNATURE.length) return "notPng";
  if (!SIGNATURE.every((b, i) => bytes[i] === b)) return "notPng";

  let header: Ihdr | null = null;
  const idat: Uint8Array[] = [];
  let sawEnd = false;

  // ---- walk the chunk stream ----
  let at = SIGNATURE.length;
  while (at + 8 <= bytes.length) {
    const length = readU32(bytes, at);
    // Lengths are capped at 2^31-1 by the spec, and anything near that is a
    // lie in a file this size — either way it cannot be indexed safely.
    if (length > 0x7fffffff) return "corrupt";

    const type = chunkType(bytes, at + 4);
    if (!/^[A-Za-z]{4}$/.test(type)) return "corrupt";

    const dataAt = at + 8;
    const crcAt = dataAt + length;
    // The chunk claims more bytes than the file has: truncated upload.
    if (crcAt + 4 > bytes.length) return "corrupt";
    // CRC is computed over the type AND the data, per the spec.
    if (crc32(bytes, at + 4, crcAt) !== readU32(bytes, crcAt)) return "corrupt";

    if (header === null) {
      // IHDR must come first, and it is always 13 bytes.
      if (type !== "IHDR" || length !== 13) return "corrupt";
      header = parseIhdr(bytes, dataAt);
      if (!header) return "corrupt";
      if (header.width * header.height > maxPixels) return "tooManyPixels";
    } else if (type === "IDAT") {
      idat.push(bytes.subarray(dataAt, crcAt));
    } else if (type === "IEND") {
      sawEnd = true;
      break;
    }

    at = crcAt + 4;
  }

  // No IHDR, or the stream stopped before IEND — the file is incomplete.
  if (!header || !sawEnd) return "corrupt";
  if (idat.length === 0) return "corrupt";

  // ---- prove the pixel data itself ----
  const expected = expectedRawBytes(header);
  // A little slack: an encoder may pad, and we only care that the image is not
  // SHORT. The ceiling is what stops a bomb.
  const inflated = await inflatedLength(Buffer.concat(idat), expected + 1024);
  if (inflated === null || inflated < expected) return "corrupt";

  return null;
}
