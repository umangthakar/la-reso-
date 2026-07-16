// ============================================================
// SERVER-ONLY WhatsApp Cloud API helper — config storage, validation,
// connection testing and test-message sending.
//
// Architecture (the secrets NEVER reach the browser):
//
//   Admin page (client)
//     ↓  /api/admin/whatsapp/*          ← password-gated
//   Next.js server (this module, service role)
//     ↓  graph()                        ← Meta Graph API
//   site_settings.whatsapp_config / whatsapp_status
//
// Config lives on the site_settings singleton (see
// supabase/sql/25_whatsapp.sql). The App Secret, Access Token and Webhook
// Verify Token are stored encrypted (lib/crypto) and decrypted only here.
// NEVER import from a Client Component.
//
// This module deliberately does NOT send order notifications — it only
// manages configuration and the two manual tests.
// ============================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// ---- Types -------------------------------------------------

export type WhatsAppStatusValue =
  | "connected"
  | "failed"
  | "not_configured"
  | "disabled";

export type WhatsAppConfig = {
  enabled: boolean;
  app_id: string;
  app_secret_enc?: string;
  access_token_enc?: string;
  verify_token_enc?: string;
  phone_number_id: string;
  waba_id: string;
  business_number: string;
  owner_number: string;
  api_version: string;
};

export type WhatsAppStatus = {
  status: WhatsAppStatusValue;
  status_message: string;
  last_success_at: string;
  last_error: string;
  last_error_at: string;
  checked_at: string;
};

/** Masked state for the admin page. Never contains a secret. */
export type AdminWhatsAppState = {
  enabled: boolean;
  app_id: string;
  phone_number_id: string;
  waba_id: string;
  business_number: string;
  owner_number: string;
  api_version: string;
  has_app_secret: boolean;
  app_secret_last4: string;
  has_access_token: boolean;
  access_token_last4: string;
  has_verify_token: boolean;
  verify_token_last4: string;
  status: WhatsAppStatusValue;
  status_message: string;
  last_success_at: string;
  last_error: string;
  last_error_at: string;
};

/** Graph API versions offered in the admin dropdown, newest first. */
export const API_VERSIONS = ["v23.0", "v22.0", "v21.0", "v20.0", "v19.0"] as const;
export const DEFAULT_API_VERSION = "v23.0";

/** Raised by validation so routes can return 400 + per-field messages. */
export class ValidationError extends Error {
  fields: Record<string, string>;
  constructor(fields: Record<string, string>) {
    super("Please fix the highlighted fields.");
    this.fields = fields;
  }
}

// ---- Small utilities ---------------------------------------

function adminDb(): SupabaseClient {
  // Cast to the untyped client: the generated Database types predate the
  // whatsapp_* columns, and (like lib/google-reviews.ts) we read the whole
  // row to tolerate a lagging PostgREST schema cache.
  return createAdminClient() as unknown as SupabaseClient;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function coerceApiVersion(v: unknown): string {
  const s = str(v).trim();
  return (API_VERSIONS as readonly string[]).includes(s) ? s : DEFAULT_API_VERSION;
}

function safeDecrypt(token: string): string {
  try {
    return decryptSecret(token);
  } catch {
    return "";
  }
}

function last4(enc: string | undefined): string {
  if (!enc) return "";
  const plain = safeDecrypt(enc);
  return plain ? plain.slice(-4) : "";
}

/** E.164: a leading +, then 8–15 digits, first digit non-zero. */
const E164 = /^\+[1-9]\d{7,14}$/;

export function isValidPhone(v: string): boolean {
  return E164.test(v.trim());
}

/** Meta wants the recipient as bare digits (no +, no spaces). */
function toMsisdn(v: string): string {
  return v.replace(/\D/g, "");
}

// ---- Config / status persistence ---------------------------

type SettingsRow = {
  id?: string;
  whatsapp_config?: Partial<WhatsAppConfig> | null;
  whatsapp_status?: Partial<WhatsAppStatus> | null;
};

async function loadRow(supabase: SupabaseClient): Promise<{
  id: string | null;
  config: WhatsAppConfig;
  status: WhatsAppStatus | null;
}> {
  // Read the whole row rather than the columns directly: a freshly-added
  // column can lag PostgREST's schema cache and 400 a targeted select.
  const { data, error } = await supabase
    .from("site_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as SettingsRow;
  const rawCfg = (row.whatsapp_config ?? {}) as Partial<WhatsAppConfig>;
  const rawStatus = (row.whatsapp_status ?? null) as Partial<WhatsAppStatus> | null;

  const config: WhatsAppConfig = {
    enabled: Boolean(rawCfg.enabled),
    app_id: str(rawCfg.app_id),
    app_secret_enc: str(rawCfg.app_secret_enc) || undefined,
    access_token_enc: str(rawCfg.access_token_enc) || undefined,
    verify_token_enc: str(rawCfg.verify_token_enc) || undefined,
    phone_number_id: str(rawCfg.phone_number_id),
    waba_id: str(rawCfg.waba_id),
    business_number: str(rawCfg.business_number),
    owner_number: str(rawCfg.owner_number),
    api_version: coerceApiVersion(rawCfg.api_version),
  };

  const status: WhatsAppStatus | null = rawStatus
    ? {
        status: (rawStatus.status as WhatsAppStatusValue) || "not_configured",
        status_message: str(rawStatus.status_message),
        last_success_at: str(rawStatus.last_success_at),
        last_error: str(rawStatus.last_error),
        last_error_at: str(rawStatus.last_error_at),
        checked_at: str(rawStatus.checked_at),
      }
    : null;

  return { id: row.id ?? null, config, status };
}

async function writeColumn(
  supabase: SupabaseClient,
  id: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  const res = id
    ? await supabase.from("site_settings").update(payload).eq("id", id)
    : await supabase.from("site_settings").insert(payload);
  if (res.error) throw new Error(res.error.message);
}

/** Record the outcome of a test. Never throws — a status write must not
 *  mask the actual test result the admin is waiting on. */
async function recordStatus(
  supabase: SupabaseClient,
  id: string | null,
  prev: WhatsAppStatus | null,
  next: { ok: boolean; status: WhatsAppStatusValue; message: string },
): Promise<void> {
  const now = new Date().toISOString();
  const status: WhatsAppStatus = {
    status: next.status,
    status_message: next.message,
    last_success_at: next.ok ? now : prev?.last_success_at ?? "",
    last_error: next.ok ? prev?.last_error ?? "" : next.message,
    last_error_at: next.ok ? prev?.last_error_at ?? "" : now,
    checked_at: now,
  };
  try {
    await writeColumn(supabase, id, { whatsapp_status: status });
  } catch (e) {
    console.error(
      "[whatsapp] status write failed:",
      e instanceof Error ? e.message : e,
    );
  }
}

// ---- Meta Graph API ----------------------------------------

/** A Graph API failure carrying Meta's verbatim message. */
class GraphError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

type GraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
};

const GRAPH = "https://graph.facebook.com";

/**
 * Call the Graph API and return the parsed JSON. Throws GraphError carrying
 * Meta's exact `error.message` so the admin sees the real reason rather than
 * a paraphrase.
 */
async function graph<T>(
  path: string,
  token: string,
  init?: { method?: "GET" | "POST"; body?: unknown },
): Promise<T> {
  let res: Response;
  let json: unknown;
  try {
    res = await fetch(`${GRAPH}/${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    json = await res.json();
  } catch (e) {
    throw new GraphError(
      e instanceof Error ? e.message : "Network error contacting Meta.",
    );
  }

  if (!res.ok) {
    const err = (json as GraphErrorBody)?.error;
    // error_user_msg is the friendlier variant Meta sometimes supplies;
    // fall back to `message`, which is always present on a Graph error.
    const message =
      str(err?.error_user_msg) ||
      str(err?.message) ||
      `Meta returned HTTP ${res.status}.`;
    throw new GraphError(message, err?.code);
  }
  return json as T;
}

function graphMessage(e: unknown): string {
  if (e instanceof GraphError) {
    return e.code ? `${e.message} (code ${e.code})` : e.message;
  }
  return e instanceof Error ? e.message : "Unknown error.";
}

// ---- Validation --------------------------------------------

type ConfigInput = {
  enabled: boolean;
  app_id: string;
  phone_number_id: string;
  waba_id: string;
  business_number: string;
  owner_number: string;
  api_version: string;
  app_secret?: string;
  access_token?: string;
  verify_token?: string;
};

/**
 * Validate an incoming config. Secrets count as "present" if a new value was
 * typed OR one is already stored, so re-saving without retyping is allowed.
 *
 * Only the fields needed to actually send a message are required, and only
 * when the integration is switched on: you can save a partial draft while
 * disabled. App ID / App Secret / Verify Token are for the webhook flow
 * (a later task) and stay optional here.
 */
function validate(input: ConfigInput, existing: WhatsAppConfig): void {
  const fields: Record<string, string> = {};

  const version = str(input.api_version).trim();
  if (!version) {
    fields.api_version = "Choose an API version.";
  } else if (!(API_VERSIONS as readonly string[]).includes(version)) {
    fields.api_version = `Unsupported API version. Choose one of: ${API_VERSIONS.join(", ")}.`;
  }

  const business = str(input.business_number).trim();
  const owner = str(input.owner_number).trim();

  if (business && !isValidPhone(business)) {
    fields.business_number = "Use international format, e.g. +447960555702.";
  }
  if (owner && !isValidPhone(owner)) {
    fields.owner_number = "Use international format, e.g. +447960555702.";
  }

  if (input.enabled) {
    const hasToken =
      Boolean(str(input.access_token).trim()) || Boolean(existing.access_token_enc);
    if (!hasToken) fields.access_token = "Required to send messages.";
    if (!str(input.phone_number_id).trim()) {
      fields.phone_number_id = "Required to send messages.";
    }
    if (!business) fields.business_number = "Required when notifications are on.";
    if (!owner) fields.owner_number = "Required — this number receives notifications.";
  }

  if (Object.keys(fields).length > 0) throw new ValidationError(fields);
}

// ---- Public admin operations -------------------------------

function toAdminState(
  config: WhatsAppConfig,
  status: WhatsAppStatus | null,
): AdminWhatsAppState {
  return {
    enabled: config.enabled,
    app_id: config.app_id,
    phone_number_id: config.phone_number_id,
    waba_id: config.waba_id,
    business_number: config.business_number,
    owner_number: config.owner_number,
    api_version: config.api_version,
    has_app_secret: Boolean(config.app_secret_enc),
    app_secret_last4: last4(config.app_secret_enc),
    has_access_token: Boolean(config.access_token_enc),
    access_token_last4: last4(config.access_token_enc),
    has_verify_token: Boolean(config.verify_token_enc),
    verify_token_last4: last4(config.verify_token_enc),
    status: status?.status ?? "not_configured",
    status_message: status?.status_message ?? "",
    last_success_at: status?.last_success_at ?? "",
    last_error: status?.last_error ?? "",
    last_error_at: status?.last_error_at ?? "",
  };
}

/** Masked config + status for the admin page. Never returns a secret. */
export async function getAdminWhatsAppState(): Promise<AdminWhatsAppState> {
  const { config, status } = await loadRow(adminDb());
  return toAdminState(config, status);
}

/**
 * Persist config from the admin page. A blank secret keeps the existing
 * stored value (mirrors the Stripe / Google Reviews behaviour). Secrets are
 * encrypted before saving. Throws ValidationError on bad input.
 */
export async function saveAdminWhatsAppConfig(
  input: ConfigInput,
): Promise<AdminWhatsAppState> {
  const supabase = adminDb();
  const { id, config: existing, status } = await loadRow(supabase);

  validate(input, existing);

  // Blank = keep existing; a typed value replaces it.
  const nextSecret = (incoming: string | undefined, current?: string) => {
    const v = str(incoming).trim();
    return v ? encryptSecret(v) : current;
  };

  const app_secret_enc = nextSecret(input.app_secret, existing.app_secret_enc);
  const access_token_enc = nextSecret(input.access_token, existing.access_token_enc);
  const verify_token_enc = nextSecret(input.verify_token, existing.verify_token_enc);

  const config: WhatsAppConfig = {
    enabled: Boolean(input.enabled),
    app_id: str(input.app_id).trim(),
    phone_number_id: str(input.phone_number_id).trim(),
    waba_id: str(input.waba_id).trim(),
    business_number: str(input.business_number).trim(),
    owner_number: str(input.owner_number).trim(),
    api_version: coerceApiVersion(input.api_version),
    ...(app_secret_enc ? { app_secret_enc } : {}),
    ...(access_token_enc ? { access_token_enc } : {}),
    ...(verify_token_enc ? { verify_token_enc } : {}),
  };

  await writeColumn(supabase, id, { whatsapp_config: config });
  return toAdminState(config, status);
}

export type TestResult = {
  ok: boolean;
  status: WhatsAppStatusValue;
  message: string;
  details?: {
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    waba_name?: string;
  };
};

type PhoneNumberNode = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
};

type WabaNode = { id?: string; name?: string };

/**
 * Verify the stored credentials against Meta:
 *   1. the Access Token + Phone Number ID + messaging permission, by reading
 *      the phone number node (this fails if the token is invalid, expired or
 *      missing whatsapp_business_messaging);
 *   2. the WhatsApp Business Account, when a WABA ID is set.
 * Records the outcome in whatsapp_status. Sends no message.
 */
export async function testConnection(): Promise<TestResult> {
  const supabase = adminDb();
  const { id, config, status: prev } = await loadRow(supabase);

  const token = config.access_token_enc ? safeDecrypt(config.access_token_enc) : "";
  if (!token || !config.phone_number_id) {
    const result: TestResult = {
      ok: false,
      status: "not_configured",
      message: "Add a Permanent Access Token and Phone Number ID first, then save.",
    };
    await recordStatus(supabase, id, prev, result);
    return result;
  }

  const v = config.api_version;
  try {
    const phone = await graph<PhoneNumberNode>(
      `${v}/${encodeURIComponent(config.phone_number_id)}?fields=id,display_phone_number,verified_name,quality_rating`,
      token,
    );

    let waba_name: string | undefined;
    if (config.waba_id) {
      const waba = await graph<WabaNode>(
        `${v}/${encodeURIComponent(config.waba_id)}?fields=id,name`,
        token,
      );
      waba_name = str(waba.name) || undefined;
    }

    const result: TestResult = {
      ok: true,
      status: "connected",
      message: "Connected successfully",
      details: {
        display_phone_number: str(phone.display_phone_number) || undefined,
        verified_name: str(phone.verified_name) || undefined,
        quality_rating: str(phone.quality_rating) || undefined,
        waba_name,
      },
    };
    await recordStatus(supabase, id, prev, result);
    return result;
  } catch (e) {
    const result: TestResult = {
      ok: false,
      status: "failed",
      message: graphMessage(e),
    };
    console.error("[whatsapp] connection test failed:", result.message);
    await recordStatus(supabase, id, prev, result);
    return result;
  }
}

const TEST_MESSAGE = [
  "Le Rasa Bakery",
  "",
  "WhatsApp integration is working successfully.",
  "",
  "This is a test notification.",
].join("\n");

/**
 * Send a plain-text test message to the configured Owner WhatsApp Number.
 *
 * NOTE: free-form text can only be delivered inside the 24-hour customer
 * service window — i.e. the owner number must have messaged the business
 * number within the last 24 hours. Outside it, Meta rejects the send (code
 * 131047) and that verbatim error is surfaced to the admin.
 */
export async function sendTestMessage(): Promise<TestResult> {
  const supabase = adminDb();
  const { id, config, status: prev } = await loadRow(supabase);

  const token = config.access_token_enc ? safeDecrypt(config.access_token_enc) : "";
  if (!token || !config.phone_number_id) {
    const result: TestResult = {
      ok: false,
      status: "not_configured",
      message: "Add a Permanent Access Token and Phone Number ID first, then save.",
    };
    await recordStatus(supabase, id, prev, result);
    return result;
  }
  if (!config.owner_number) {
    const result: TestResult = {
      ok: false,
      status: "not_configured",
      message: "Add an Owner WhatsApp Number first, then save.",
    };
    await recordStatus(supabase, id, prev, result);
    return result;
  }

  try {
    await graph<{ messages?: Array<{ id?: string }> }>(
      `${config.api_version}/${encodeURIComponent(config.phone_number_id)}/messages`,
      token,
      {
        method: "POST",
        body: {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: toMsisdn(config.owner_number),
          type: "text",
          text: { preview_url: false, body: TEST_MESSAGE },
        },
      },
    );
    const result: TestResult = {
      ok: true,
      status: "connected",
      message: `Test message sent to ${config.owner_number}`,
    };
    await recordStatus(supabase, id, prev, result);
    return result;
  } catch (e) {
    const result: TestResult = {
      ok: false,
      status: "failed",
      message: graphMessage(e),
    };
    console.error("[whatsapp] test message failed:", result.message);
    await recordStatus(supabase, id, prev, result);
    return result;
  }
}
