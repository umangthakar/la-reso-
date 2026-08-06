// ============================================================
// SERVER-ONLY symmetric encryption for secrets at rest.
// ------------------------------------------------------------
// Used to encrypt the Stripe secret key before it is stored in the
// Supabase site_settings row, so a DB leak alone does not expose it.
//
// AES-256-GCM with a random 12-byte IV per message. The 32-byte key is
// derived (scrypt) from ADMIN_ENCRYPTION_KEY — both it and the legacy
// service-role key are server-only secrets that never reach the browser.
// Set ADMIN_ENCRYPTION_KEY in .env.local to a long random string so
// rotating the service-role key doesn't lose stored secrets.
//
// ENCRYPTION uses ADMIN_ENCRYPTION_KEY when set. DECRYPTION additionally
// falls back to the service-role key, so secrets written before
// ADMIN_ENCRYPTION_KEY existed keep opening after it is introduced —
// setting it on a live site can never strand the stored Stripe key.
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

// scrypt is deliberately slow, so each derived key is memoised by the secret
// that produced it. Two entries at most (primary + legacy).
const derived = new Map<string, Buffer>();

function deriveKey(secret: string): Buffer {
  let k = derived.get(secret);
  if (!k) {
    k = scryptSync(secret, SALT, 32);
    derived.set(secret, k);
  }
  return k;
}

/**
 * Every master secret this deployment can decrypt with, MOST PREFERRED FIRST.
 *
 * ADMIN_ENCRYPTION_KEY is the primary: new secrets are always encrypted with
 * it. SUPABASE_SERVICE_ROLE_KEY stays in the list as a LEGACY DECRYPTION key,
 * because deployments that ran before ADMIN_ENCRYPTION_KEY was set encrypted
 * their Stripe secret key with it. Without this fallback, setting
 * ADMIN_ENCRYPTION_KEY on a live site would make the stored Stripe key
 * undecryptable and take payments down — the migration is therefore automatic
 * and needs no re-entry of the key.
 *
 * Rotation is likewise transparent: re-saving a secret in the admin panel
 * re-encrypts it under the primary key.
 */
function masterSecrets(): string[] {
  const secrets = [
    process.env.ADMIN_ENCRYPTION_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);

  // De-duplicate so a deployment that sets both to the same value doesn't
  // derive (and try) the identical key twice.
  return secrets.filter((s, i) => secrets.indexOf(s) === i);
}

/** The key NEW ciphertext is produced with — the most preferred secret. */
function primaryKey(): Buffer {
  const [secret] = masterSecrets();
  if (!secret) {
    throw new Error(
      "Missing ADMIN_ENCRYPTION_KEY (or SUPABASE_SERVICE_ROLE_KEY) for secret encryption.",
    );
  }
  return deriveKey(secret);
}

/** Encrypt a plaintext string. Returns a self-describing token safe to store. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", primaryKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${FORMAT}:${Buffer.concat([iv, tag, enc]).toString("base64")}`;
}

/**
 * Decrypt a token produced by encryptSecret. Throws if tampered/invalid.
 *
 * Tries the primary key first, then any legacy key (see masterSecrets), so a
 * secret encrypted before ADMIN_ENCRYPTION_KEY was introduced keeps working
 * once it is set. GCM authenticates, so a wrong key throws rather than
 * returning garbage — trying the next one is safe, not a guess.
 */
export function decryptSecret(token: string): string {
  const [tag, payload] = token.split(":");
  if (tag !== FORMAT || !payload) {
    throw new Error("Invalid encrypted secret format.");
  }
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);

  const secrets = masterSecrets();
  if (secrets.length === 0) {
    throw new Error(
      "Missing ADMIN_ENCRYPTION_KEY (or SUPABASE_SERVICE_ROLE_KEY) for secret encryption.",
    );
  }

  for (const secret of secrets) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      // Wrong key for this ciphertext — try the next one.
    }
  }
  // Deliberately generic: never echo key material or ciphertext into a log.
  throw new Error(
    "Could not decrypt stored secret with any configured encryption key.",
  );
}
