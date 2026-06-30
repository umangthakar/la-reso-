// ============================================================
// SERVER-ONLY symmetric encryption for secrets at rest.
// ------------------------------------------------------------
// Used to encrypt the Stripe secret key before it is stored in the
// Supabase site_settings row, so a DB leak alone does not expose it.
//
// AES-256-GCM with a random 12-byte IV per message. The 32-byte key is
// derived (scrypt) from ADMIN_ENCRYPTION_KEY if set, otherwise from the
// service-role key — both are server-only secrets that never reach the
// browser. Set ADMIN_ENCRYPTION_KEY in .env.local to a long random
// string so rotating the service-role key doesn't lose stored secrets.
//
// NEVER import this from a Client Component.
// ============================================================

import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";

const FORMAT = "v1"; // version tag → "v1:<base64(iv|tag|ciphertext)>"
const SALT = "le-rasa-secret-store"; // fixed salt is fine: the master secret is high-entropy

let cachedKey: Buffer | null = null;

function masterSecret(): string {
  const s =
    process.env.ADMIN_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error(
      "Missing ADMIN_ENCRYPTION_KEY (or SUPABASE_SERVICE_ROLE_KEY) for secret encryption.",
    );
  }
  return s;
}

function key(): Buffer {
  if (!cachedKey) cachedKey = scryptSync(masterSecret(), SALT, 32);
  return cachedKey;
}

/** Encrypt a plaintext string. Returns a self-describing token safe to store. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${FORMAT}:${Buffer.concat([iv, tag, enc]).toString("base64")}`;
}

/** Decrypt a token produced by encryptSecret. Throws if tampered/invalid. */
export function decryptSecret(token: string): string {
  const [tag, payload] = token.split(":");
  if (tag !== FORMAT || !payload) {
    throw new Error("Invalid encrypted secret format.");
  }
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
