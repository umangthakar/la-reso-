-- ============================================================
-- Le Rasa Bakery — 21_cake_customization.sql
-- ------------------------------------------------------------
-- The Cake Customization Wizard's schema. Two tables describe the ENTIRE
-- wizard: every accessory group, its display type, its price, its validation
-- rules and its conditional visibility. There is deliberately NO hardcoded
-- accessory list, option list or price anywhere in application code — adding
-- "Balloons" to the wizard is a row insert here, never a code change.
--
-- IDEMPOTENT: safe to run repeatedly (IF NOT EXISTS, DROP POLICY IF EXISTS,
-- ON CONFLICT DO NOTHING) — same conventions as 00_full_setup.sql.
--
-- PURELY ADDITIVE: two new tables, plus additive columns on `products` and
-- `order_items`. No existing table, column or migration is modified, so a DB
-- that has not run this file still checks out exactly as it does today.
--
-- Security posture:
--   * anon reads ACTIVE groups/options only — an inactive accessory is a
--     draft, and prices must be readable to render the wizard.
--   * No public INSERT/UPDATE/DELETE. Accessory prices are re-read
--     SERVER-SIDE at checkout (see app/api/checkout/create-intent), so a
--     tampered client can never buy a £12 topper for £0.
-- ============================================================


-- ============================================================
-- 1. WHICH PRODUCTS ARE CAKES?
-- ------------------------------------------------------------
-- The wizard opens for a product because of THIS column, not because its
-- category happens to contain the word "cake" in application code. The admin
-- can flip it per product (a cupcake box could be customizable; a "Cake Slice"
-- might not be) without touching the codebase.
--
-- The backfill below is a one-time convenience so an existing catalogue lights
-- up immediately; `where is_customizable = false` keeps a re-run from undoing
-- an admin's later decision to turn a specific cake off.
-- ============================================================
alter table public.products
  add column if not exists is_customizable boolean not null default false;

update public.products
   set is_customizable = true
 where is_customizable = false
   and coalesce(category, '') ilike '%cake%';


-- ============================================================
-- 2. ACCESSORY GROUPS  (one row = one control in the wizard)
-- ------------------------------------------------------------
--   key            stable identifier used in the saved selection JSON and in
--                  depends_on_key. Renaming a LABEL must never orphan an
--                  order's stored customization, so the label is cosmetic and
--                  this is the real identity.
--   display_type   which control to render:
--                    radio     — pick exactly one option (Candles)
--                    dropdown  — pick exactly one option (Cake Topper)
--                    checkbox  — pick any number of options (Decorations)
--                    toggle    — yes/no (Knife, Gift Wrap)
--                    text      — single-line free text (Cake Message)
--                    textarea  — multi-line free text (Delivery Notes)
--   price          the EXTRA charged when a toggle is on, or when a text /
--                  textarea group is filled in. 0 = free. Per-option prices
--                  live on the options table instead.
--   required       the customer cannot continue while this is unanswered.
--   max_chars      character limit for text / textarea (null = no limit).
--   depends_on_key CONDITIONAL VISIBILITY: this group is only shown when the
--   depends_on_value  group named by depends_on_key currently holds this
--                  value ('yes' for a toggle parent, otherwise an option's
--                  `value`). This is how "Greeting Card → message textbox"
--                  and "Cake Topper → Custom → custom text" work, with no
--                  special-casing in the UI code. A hidden group's answer is
--                  discarded and never priced, so an invalid combination
--                  cannot reach the cart.
--   categories     [] = offered on every customizable product; otherwise only
--                  on products in these categories.
-- ============================================================
create table if not exists public.cake_accessory_groups (
  id               uuid primary key default gen_random_uuid(),
  key              text not null unique,
  label            text not null,
  display_type     text not null check (
                     display_type in
                     ('radio','dropdown','checkbox','toggle','text','textarea')
                   ),
  help_text        text,
  placeholder      text,
  price            numeric(10,2) not null default 0 check (price >= 0),
  required         boolean not null default false,
  max_chars        integer check (max_chars is null or max_chars > 0),
  depends_on_key   text,
  depends_on_value text,
  categories       jsonb not null default '[]'::jsonb,
  sort_order       integer not null default 0,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- A group cannot depend on itself, and a dependency needs both halves.
alter table public.cake_accessory_groups
  drop constraint if exists cake_accessory_groups_depends_ck;
alter table public.cake_accessory_groups
  add constraint cake_accessory_groups_depends_ck check (
    (depends_on_key is null and depends_on_value is null)
    or (depends_on_key is not null and depends_on_value is not null
        and depends_on_key <> key)
  );


-- ============================================================
-- 3. ACCESSORY OPTIONS  (radio / dropdown / checkbox choices)
-- ------------------------------------------------------------
-- Each option carries its OWN price, so "Sparkler +£3.50" and "None £0" sit
-- in the same group. `value` is the stable identity stored on the order.
-- ============================================================
create table if not exists public.cake_accessory_options (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.cake_accessory_groups(id) on delete cascade,
  value      text not null,
  label      text not null,
  price      numeric(10,2) not null default 0 check (price >= 0),
  is_default boolean not null default false,
  sort_order integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_id, value)
);

create index if not exists cake_accessory_options_group_idx
  on public.cake_accessory_options (group_id, sort_order);


-- ============================================================
-- 4. ORDER SNAPSHOT
-- ------------------------------------------------------------
-- What the customer chose has to survive on the order itself: the baker reads
-- it, and it must not change if the admin later edits or deletes an accessory.
--   customization  the resolved, human-readable selection for this line
--   addons_total   the accessory extra PER UNIT, so
--                  line_total = (unit_price + addons_total) * quantity
-- ============================================================
alter table public.order_items
  add column if not exists customization jsonb;
alter table public.order_items
  add column if not exists addons_total numeric(10,2) not null default 0;


-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ------------------------------------------------------------
-- Public reads of active rows only (the storefront must price the wizard).
-- Writes go through the service role, which bypasses RLS entirely.
-- ============================================================
alter table public.cake_accessory_groups  enable row level security;
alter table public.cake_accessory_options enable row level security;

drop policy if exists "cake_accessory_groups public read" on public.cake_accessory_groups;
create policy "cake_accessory_groups public read"
  on public.cake_accessory_groups for select
  using (active = true);

drop policy if exists "cake_accessory_options public read" on public.cake_accessory_options;
create policy "cake_accessory_options public read"
  on public.cake_accessory_options for select
  using (active = true);


-- ============================================================
-- 6. SEED — the launch wizard
-- ------------------------------------------------------------
-- Illustrative content, not a code dependency: every row below can be edited,
-- repriced, reordered, deactivated or deleted, and the wizard follows.
-- ON CONFLICT DO NOTHING keeps a re-run from clobbering the admin's edits.
-- ============================================================
insert into public.cake_accessory_groups
  (key, label, display_type, help_text, placeholder, price, required, max_chars,
   depends_on_key, depends_on_value, sort_order)
values
  ('candles', 'Candles', 'radio',
   'Every celebration needs a flame.', null, 0, true, null, null, null, 10),

  ('cake_message', 'Message on the cake', 'text',
   'Piped by hand on top of your cake.', 'Happy Birthday, Mum!', 0, false, 30,
   null, null, 20),

  ('cake_topper', 'Cake topper', 'dropdown',
   null, null, 0, false, null, null, null, 30),

  ('custom_topper_text', 'Your topper wording', 'text',
   'Tell us exactly what the topper should say.', 'You did it, Sam!', 0, true, 40,
   'cake_topper', 'custom', 40),

  ('greeting_card', 'Greeting card', 'toggle',
   'A handwritten card, tucked in beside the cake.', null, 2.50, false, null,
   null, null, 50),

  ('greeting_card_message', 'Card message', 'textarea',
   'We''ll write this inside the card for you.', 'Wishing you the sweetest day…',
   0, true, 200, 'greeting_card', 'yes', 60),

  ('extra_name', 'Extra name on the cake', 'text',
   null, 'Priya', 1.50, false, 30, null, null, 70),

  ('party_decorations', 'Party decorations', 'checkbox',
   'Pick as many as you like.', null, 0, false, null, null, null, 80),

  ('knife', 'Cake knife', 'toggle',
   'A serving knife, boxed with your cake.', null, 1.50, false, null,
   null, null, 90),

  ('birthday_cap', 'Birthday cap', 'toggle',
   null, null, 1.00, false, null, null, null, 100),

  ('gift_wrap', 'Gift wrap', 'toggle',
   'Wrapped in our ribboned blush paper.', null, 3.00, false, null,
   null, null, 110),

  ('delivery_notes', 'Delivery notes', 'textarea',
   'Gate codes, buzzer numbers, "leave with next door" — anything we should know.',
   'Ring the top bell, the dog barks but he''s friendly.', 0, false, 300,
   null, null, 120)
on conflict (key) do nothing;


-- Options for the choice-based groups, resolved by key so the insert is
-- independent of the generated uuids above.
insert into public.cake_accessory_options (group_id, value, label, price, is_default, sort_order)
select g.id, v.value, v.label, v.price, v.is_default, v.sort_order
  from public.cake_accessory_groups g
  join (values
    ('candles', 'none',          'None',           0.00, true,  10),
    ('candles', 'magic',         'Magic candle',   2.50, false, 20),
    ('candles', 'number',        'Number candle',  1.50, false, 30),
    ('candles', 'sparkler',      'Sparkler',       3.00, false, 40),

    ('cake_topper', 'none',          'No topper',           0.00, true,  10),
    ('cake_topper', 'happy_birthday','Happy Birthday',      4.00, false, 20),
    ('cake_topper', 'anniversary',   'Happy Anniversary',   4.00, false, 30),
    ('cake_topper', 'congrats',      'Congratulations',     4.00, false, 40),
    ('cake_topper', 'custom',        'Custom wording',      6.00, false, 50),

    ('party_decorations', 'balloons',  'Balloons (set of 6)', 4.50, false, 10),
    ('party_decorations', 'banner',    'Happy Birthday banner', 3.50, false, 20),
    ('party_decorations', 'confetti',  'Table confetti',      2.00, false, 30),
    ('party_decorations', 'party_hats','Party hats (set of 4)', 3.00, false, 40)
  ) as v(group_key, value, label, price, is_default, sort_order)
    on v.group_key = g.key
on conflict (group_id, value) do nothing;
