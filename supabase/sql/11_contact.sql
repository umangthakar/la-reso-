-- ============================================================
-- 11_contact.sql — unified contact details
--
-- Single source of truth for all contact info shown on the site. Replaces
-- the scattered legacy columns (phone / whatsapp / email / address) with one
-- jsonb column the admin edits in one "Contact Details" card.
--
-- Shape: { "phone": "...", "whatsapp": "...", "email": "...", "address": "..." }
-- Safe to run more than once.
-- ============================================================

alter table public.site_settings
  add column if not exists contact jsonb not null default
    '{"phone": "", "whatsapp": "", "email": "", "address": ""}'::jsonb;

-- Backfill from the legacy columns so existing installs keep their details.
-- Guarded to only run while `contact` is still empty — never overwrites values
-- set from the admin panel.
update public.site_settings
set contact = jsonb_build_object(
  'phone',    coalesce(phone, ''),
  'whatsapp', coalesce(whatsapp, ''),
  'email',    coalesce(email, ''),
  'address',  coalesce(address, '')
)
where coalesce(contact->>'phone', '') = ''
  and coalesce(contact->>'whatsapp', '') = ''
  and coalesce(contact->>'email', '') = ''
  and coalesce(contact->>'address', '') = '';
