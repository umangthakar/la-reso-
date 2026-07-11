-- ============================================================
-- Le Rasa Bakery — 19_policies.sql
-- ------------------------------------------------------------
-- The Policy Management System's schema: one `policies` table holding every
-- customer-facing policy document (Privacy Policy, Delivery Policy, Refund
-- Policy, Terms & Conditions, and anything else the admin adds later).
--
-- Everything about a policy — its title, blurb, body, button label, URL,
-- position and on/off state — is a column here. There is deliberately NO
-- hardcoded policy list or fallback array anywhere in application code: the
-- footer and /policies/[slug] read this table and nothing else, so adding a
-- policy is a row insert from the admin panel, never a code change.
--
-- `content` is Markdown SOURCE, rendered at read time. Storing HTML instead
-- would make the admin panel an XSS vector on every page that prints it.
--
-- IDEMPOTENT: safe to run repeatedly (IF NOT EXISTS, DROP POLICY IF EXISTS,
-- ON CONFLICT DO NOTHING) — same conventions as 00_full_setup.sql.
--
-- PURELY ADDITIVE: creates one new table and touches nothing that already
-- exists. No existing migration is modified.
--
-- Security posture:
--   * anon reads ENABLED policies only — a disabled policy is a draft, and a
--     draft must not be readable by URL before the admin publishes it.
--   * No public INSERT/UPDATE/DELETE. The admin panel writes through the
--     SERVICE ROLE key server-side, which bypasses RLS entirely — exactly the
--     model every other admin table uses.
-- ============================================================


-- ============================================================
-- 1. POLICIES
-- ------------------------------------------------------------
--   title             heading shown in the footer link and on the page
--   short_description one-line blurb for the footer / policy index card
--   content           Markdown source of the full document
--   read_more_text    label on the link through to the full page, per-policy
--                     so the admin can say "Read More" on one and
--                     "View Terms" on another without a code change
--   slug              REAL stored column, not derived. This is the URL:
--                     /policies/<slug>. Products have no slug column and
--                     /menu/[slug] therefore re-slugifies every name to find a
--                     match; policies do not repeat that trick. lib/slug.ts's
--                     slugify() is only an input-assist when typing a new
--                     policy — the lookup is always a direct match on THIS
--                     column, so renaming a policy's title can never silently
--                     break a link customers have already bookmarked.
--   display_order     admin drag-to-reorder position (footer order)
--   enabled           admin on/off switch; doubles as draft/published
--
-- The slug CHECK mirrors what slugify() produces: lowercase alphanumerics in
-- hyphen-separated groups, with no leading, trailing or doubled hyphens, and
-- never empty. It exists so a hand-edited row in the Supabase table editor
-- cannot mint a URL like "Privacy Policy" or "-refund--policy-" that the
-- storefront would then 404 on.
-- ============================================================
create table if not exists public.policies (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  short_description text not null default '',
  content           text not null default '',  -- Markdown source
  read_more_text    text not null default 'Read More',
  slug              text not null unique,      -- e.g. 'privacy-policy'
  display_order     integer not null default 0,
  enabled           boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint policies_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);


-- ============================================================
-- 2. INDEXES
-- ------------------------------------------------------------
-- The UNIQUE on `slug` above already backs it with an index, and that index is
-- the lookup key for /policies/[slug] — every policy page load is a single
-- equality probe against it. It is called out here because it is load-bearing
-- for routing, not merely a uniqueness guard: dropping the UNIQUE would also
-- drop the index the storefront's page route depends on.
--
-- (enabled, display_order) serves the public storefront query — enabled
-- policies, in admin-chosen order — which runs in the footer on EVERY page of
-- the site. Column order matters: `enabled` is the equality filter, so it
-- leads; `display_order` then supplies the sort, letting Postgres satisfy the
-- whole query from the index without a sort step.
-- ============================================================
create index if not exists idx_policies_enabled_order
  on public.policies (enabled, display_order);


-- ============================================================
-- 3. TRIGGER (keep updated_at fresh — reuses set_updated_at from 00_full_setup)
-- ============================================================
drop trigger if exists trg_policies_updated on public.policies;
create trigger trg_policies_updated before update on public.policies
  for each row execute function public.set_updated_at();


-- ============================================================
-- 4. SEED — the four starting policies
-- ------------------------------------------------------------
-- Real rows, not a fallback array in frontend code. They exist so the admin
-- opens a populated panel instead of an empty one; every field below is meant
-- to be edited or the row deleted outright. The content is an obvious
-- placeholder on purpose — it must never read as if it were real legal copy
-- the bakery has actually committed to.
--
-- ON CONFLICT (slug) DO NOTHING keeps this file re-runnable: once the admin
-- has edited these, re-running the migration will not overwrite their work.
-- ============================================================
insert into public.policies
  (title, slug, short_description, content, read_more_text, display_order, enabled)
values
  (
    'Privacy Policy',
    'privacy-policy',
    'How we collect, use and protect your personal information.',
    E'## Privacy Policy\n\n_Placeholder — replace this from the admin panel._\n\nThis section should explain what personal data Le Rasa Bakery collects, why it is collected, how long it is kept, and how a customer can request its deletion.',
    'Read More',
    1,
    true
  ),
  (
    'Delivery Policy',
    'delivery-policy',
    'Delivery areas, timings and charges for your order.',
    E'## Delivery Policy\n\n_Placeholder — replace this from the admin panel._\n\nThis section should explain which postcodes are served, delivery lead times, delivery charges and any free-delivery threshold, and what happens if nobody is home.',
    'Read More',
    2,
    true
  ),
  (
    'Refund Policy',
    'refund-policy',
    'When and how you can cancel an order or request a refund.',
    E'## Refund Policy\n\n_Placeholder — replace this from the admin panel._\n\nThis section should explain the cancellation window, which orders are refundable, how a refund is requested, and how long the money takes to arrive.',
    'Read More',
    3,
    true
  ),
  (
    'Terms & Conditions',
    'terms-and-conditions',
    'The terms you agree to when ordering from Le Rasa Bakery.',
    E'## Terms & Conditions\n\n_Placeholder — replace this from the admin panel._\n\nThis section should set out the terms of sale, allergen and food-safety responsibilities, pricing and payment terms, and the limits of the bakery''s liability.',
    'Read More',
    4,
    true
  )
on conflict (slug) do nothing;


-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================
alter table public.policies enable row level security;

-- Public read of ENABLED policies only — same trust level and shape as
-- "Public read visible products" in 00_full_setup.sql. A disabled policy is a
-- draft: RLS is what stops it being fetched by URL before it is published, so
-- the page route does not have to remember to filter.
--
-- There is intentionally NO anon INSERT/UPDATE/DELETE policy. With RLS on and
-- no permissive policy for those commands, anon and authenticated are denied
-- them outright. The admin panel is the only writer and it goes through the
-- service role, which bypasses RLS.
drop policy if exists "Public read enabled policies" on public.policies;
create policy "Public read enabled policies"
  on public.policies for select
  using (enabled = true);


-- ============================================================
-- DONE. Reload the PostgREST schema cache so the new table is queryable
-- immediately:
--   notify pgrst, 'reload schema';
-- ============================================================
notify pgrst, 'reload schema';
