-- ============================================================
-- Le Rasa Bakery — 20_policy_icons.sql
-- ------------------------------------------------------------
-- Adds ONE optional column to the existing `policies` table (19_policies.sql):
--
--   icon_url  an image the admin uploaded for this policy, or '' for none.
--
-- The home page's policy cards show an icon above each title. When this column
-- is blank the storefront falls back to a Lucide outline icon chosen from the
-- policy's slug/title (ShieldCheck / Truck / RotateCcw / FileText — see
-- defaultPolicyIcon() in lib/policies.ts), so a policy ALWAYS has an icon and
-- the admin only has to touch this field if they want to override it.
--
-- `short_description` is NOT added here — it already exists in 19_policies.sql.
-- Policy storage stays a single table; this is a column, not a second store.
--
-- IDEMPOTENT (add column if not exists) and PURELY ADDITIVE: no existing table,
-- policy, index or row is modified. Existing rows get '' via the DEFAULT, so
-- every policy keeps working with no backfill.
-- ============================================================

alter table public.policies
  add column if not exists icon_url text not null default '';


-- ============================================================
-- DONE. Reload the PostgREST schema cache so the new column is selectable
-- immediately (without this, /api/policies keeps 400ing on `icon_url`):
--   notify pgrst, 'reload schema';
-- ============================================================
notify pgrst, 'reload schema';
