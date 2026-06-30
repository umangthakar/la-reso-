-- ============================================================
-- LE RASA BAKERY — payments (Stripe config + refunds)
-- Run this ONCE in the Supabase SQL Editor. Idempotent.
--
-- - site_settings.stripe_config: encrypted Stripe keys + mode, stored as
--   { publishable_key, secret_key_enc, mode }. The secret key is encrypted
--   at rest by the server (lib/crypto) before it ever reaches the DB.
-- - orders gets the fields the refunds tool needs. These are populated by
--   the checkout flow; the admin refunds page reads them.
-- ============================================================

-- Stripe settings live on the single site_settings row.
alter table site_settings
  add column if not exists stripe_config jsonb;

-- Order total (in pounds) shown on the refunds screen.
alter table orders
  add column if not exists amount numeric(10, 2);

-- Stripe PaymentIntent id for the order — required to issue a refund.
alter table orders
  add column if not exists stripe_payment_intent text;

-- When the order was refunded (status is also set to 'refunded').
alter table orders
  add column if not exists refunded_at timestamptz;
