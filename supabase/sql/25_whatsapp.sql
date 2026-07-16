-- ============================================================
-- 25_whatsapp.sql
-- ------------------------------------------------------------
-- WhatsApp Cloud API settings (admin-panel managed, mirrors the
-- Stripe / Google Reviews pattern).
--
-- Adds two jsonb columns to the site_settings singleton:
--
--   whatsapp_config  — SECRET config:
--     {
--       enabled:           boolean,
--       app_id:            string,
--       app_secret_enc:    string,   -- AES-256-GCM (lib/crypto), NEVER
--                                    --   returned to the browser
--       access_token_enc:  string,   -- AES-256-GCM, NEVER returned
--       verify_token_enc:  string,   -- AES-256-GCM, NEVER returned
--       phone_number_id:   string,
--       waba_id:           string,   -- WhatsApp Business Account ID
--       business_number:   string,   -- E.164, e.g. +447960555702
--       owner_number:      string,   -- E.164 — receives notifications
--       api_version:       string    -- e.g. "v23.0"
--     }
--
--   whatsapp_status  — non-secret status of the last connection/message test:
--     {
--       status:          string,   -- connected | failed | not_configured
--                                  --   | disabled
--       status_message:  string,
--       last_success_at: string,   -- ISO of the last SUCCESSFUL test
--       last_error:      string,   -- verbatim message from Meta
--       last_error_at:   string,   -- ISO
--       checked_at:      string    -- ISO of the last attempt (any outcome)
--     }
--
-- The three secrets are only ever read server-side (service role) and
-- decrypted with lib/crypto; they are never serialised to the client.
-- The admin page only ever receives has_* booleans and last-4 hints.
--
-- Idempotent — safe to run whether or not the columns exist.
-- Run in the Supabase SQL editor for project fessgqsjotvovzeqooza.
-- ============================================================

alter table public.site_settings
  add column if not exists whatsapp_config jsonb;

alter table public.site_settings
  add column if not exists whatsapp_status jsonb;

-- Force PostgREST to pick up the new columns immediately.
notify pgrst, 'reload schema';
