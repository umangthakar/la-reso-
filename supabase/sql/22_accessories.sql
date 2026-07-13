-- ============================================================
-- Le Rasa Bakery — 22_accessories.sql
-- ------------------------------------------------------------
-- The Accessories Management System. Supersedes 21_cake_customization.sql:
-- the two tables it created are RENAMED here into the vocabulary the admin
-- panel uses, and extended with images, descriptions and quantity selectors.
--
--   cake_accessory_groups   ->  accessory_categories
--   cake_accessory_options  ->  accessories
--
-- An ACCESSORY CATEGORY is one control on the customization page (Candles,
-- Cake Toppers, Greeting Cards, Gift Wrap, Knife, Party Decorations, Balloons,
-- Flowers, Chocolates, Macarons, or anything the admin invents). It owns the
-- display type, whether an answer is required, character limits and the
-- conditional-visibility rule.
--
-- An ACCESSORY is one item inside a category (a "Sparkler", a "Happy
-- Birthday" topper), with its own name, description, image, price and — for a
-- quantity selector — its own min/max.
--
-- Everything the customization page, the cart, the order and the admin panel
-- show comes from these two tables. There is NO hardcoded accessory, price,
-- option or category anywhere in application code.
--
-- IDEMPOTENT: safe to run repeatedly, and safe to run whether or not
-- 21_cake_customization.sql was ever applied (it detects both worlds).
--
-- PURELY ADDITIVE to everything else: no existing table, column or migration
-- outside the accessories system is modified.
-- ============================================================


-- ============================================================
-- 1. RENAME 21's TABLES (if they exist) — otherwise create fresh below.
-- ------------------------------------------------------------
-- Running 21 first is NOT required. If it was run, its rows (and any the
-- admin has already added) are carried over intact rather than re-seeded.
-- ============================================================
do $$
begin
  if to_regclass('public.cake_accessory_groups') is not null
     and to_regclass('public.accessory_categories') is null then
    alter table public.cake_accessory_groups rename to accessory_categories;
  end if;

  if to_regclass('public.cake_accessory_options') is not null
     and to_regclass('public.accessories') is null then
    alter table public.cake_accessory_options rename to accessories;
    -- the FK column follows the table it points at
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'accessories'
         and column_name = 'group_id'
    ) then
      alter table public.accessories rename column group_id to category_id;
    end if;
  end if;
end $$;


-- ============================================================
-- 2. ACCESSORY CATEGORIES  (one row = one control on the wizard)
-- ------------------------------------------------------------
--   key            stable identifier used in a saved order's selection JSON
--                  and in depends_on_key. The NAME is cosmetic and may be
--                  renamed freely; this is the real identity, so renaming
--                  "Candles" can never orphan a placed order's customization.
--   display_type   radio | dropdown | checkbox | toggle | quantity | text | textarea
--                    quantity — each accessory in the category gets its own
--                    number stepper (3 balloons, 6 macarons), priced per unit.
--   price          the extra charged when a TOGGLE is on, or when a TEXT /
--                  TEXTAREA is filled in. Per-item prices live on `accessories`.
--   required       the customer cannot continue while this is unanswered.
--   max_chars      character limit for text / textarea.
--   min_qty/max_qty  bounds for a quantity category, unless the accessory
--                  overrides them.
--   depends_on_key / depends_on_value
--                  CONDITIONAL VISIBILITY — shown only while the category
--                  named by depends_on_key holds this value ('yes' for a
--                  toggle parent, otherwise an accessory's `value`). This is
--                  how "Greeting Card -> message box" and "Topper -> Custom ->
--                  wording" work with no special-casing in the UI. A hidden
--                  category's answer is discarded and never priced, so an
--                  invalid combination cannot reach the cart.
--   product_categories  [] = offered on every customizable product; otherwise
--                  only on products in these product categories.
-- ============================================================
create table if not exists public.accessory_categories (
  id               uuid primary key default gen_random_uuid(),
  key              text not null unique,
  name             text not null,
  display_type     text not null default 'checkbox',
  description      text,
  placeholder      text,
  image_url        text,
  price            numeric(10,2) not null default 0 check (price >= 0),
  required         boolean not null default false,
  max_chars        integer check (max_chars is null or max_chars > 0),
  min_qty          integer not null default 0 check (min_qty >= 0),
  max_qty          integer not null default 10 check (max_qty >= 1),
  depends_on_key   text,
  depends_on_value text,
  categories       jsonb not null default '[]'::jsonb,
  sort_order       integer not null default 0,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- Columns added by THIS migration on top of whatever 21 created. Additive
-- no-ops when the table was just created above.
alter table public.accessory_categories add column if not exists name        text;
alter table public.accessory_categories add column if not exists description text;
alter table public.accessory_categories add column if not exists image_url   text;
alter table public.accessory_categories add column if not exists min_qty     integer not null default 0;
alter table public.accessory_categories add column if not exists max_qty     integer not null default 10;

-- 21 called these `label` and `help_text`. Fold them into the new columns and
-- drop the originals, so there is exactly ONE name for each thing.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='accessory_categories'
                and column_name='label') then
    update public.accessory_categories set name = coalesce(name, label);
    alter table public.accessory_categories drop column label;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='accessory_categories'
                and column_name='help_text') then
    update public.accessory_categories set description = coalesce(description, help_text);
    alter table public.accessory_categories drop column help_text;
  end if;
end $$;

update public.accessory_categories set name = key where name is null or name = '';
alter table public.accessory_categories alter column name set not null;

-- Re-state the display-type constraint to admit 'quantity' (21 did not).
alter table public.accessory_categories
  drop constraint if exists cake_accessory_groups_display_type_check;
alter table public.accessory_categories
  drop constraint if exists accessory_categories_display_type_ck;
alter table public.accessory_categories
  add constraint accessory_categories_display_type_ck check (
    display_type in
    ('radio','dropdown','checkbox','toggle','quantity','text','textarea')
  );

-- A category cannot depend on itself, and a dependency needs both halves.
alter table public.accessory_categories
  drop constraint if exists cake_accessory_groups_depends_ck;
alter table public.accessory_categories
  drop constraint if exists accessory_categories_depends_ck;
alter table public.accessory_categories
  add constraint accessory_categories_depends_ck check (
    (depends_on_key is null and depends_on_value is null)
    or (depends_on_key is not null and depends_on_value is not null
        and depends_on_key <> key)
  );


-- ============================================================
-- 3. ACCESSORIES  (the items inside a category)
-- ------------------------------------------------------------
-- Each accessory carries its OWN price, so "Sparkler +£3.00" and "None £0"
-- sit in the same category. `value` is the stable identity stored on the
-- order; `name` is what the customer reads and is free to rename.
-- ============================================================
create table if not exists public.accessories (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.accessory_categories(id) on delete cascade,
  value       text not null,
  name        text not null,
  description text,
  image_url   text,
  price       numeric(10,2) not null default 0 check (price >= 0),
  min_qty     integer not null default 1 check (min_qty >= 0),
  max_qty     integer not null default 10 check (max_qty >= 1),
  is_default  boolean not null default false,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (category_id, value)
);

alter table public.accessories add column if not exists name        text;
alter table public.accessories add column if not exists description text;
alter table public.accessories add column if not exists image_url   text;
alter table public.accessories add column if not exists min_qty     integer not null default 1;
alter table public.accessories add column if not exists max_qty     integer not null default 10;

-- 21 called it `label`.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='accessories'
                and column_name='label') then
    update public.accessories set name = coalesce(name, label);
    alter table public.accessories drop column label;
  end if;
end $$;

update public.accessories set name = value where name is null or name = '';
alter table public.accessories alter column name set not null;

create index if not exists accessories_category_idx
  on public.accessories (category_id, sort_order);


-- ============================================================
-- 4. PRODUCTS + ORDER SNAPSHOT
-- ------------------------------------------------------------
-- `is_customizable` decides which products open the customization page. The
-- backfill lights up an existing catalogue once; the `= false` guard keeps a
-- re-run from undoing an admin's later decision to turn a cake off.
--
-- The order snapshot must survive edits: `customization` is the resolved,
-- human-readable choice list (names, messages, quantities and prices AS
-- CHARGED), so repricing or deleting an accessory tomorrow can never rewrite
-- an order placed today. `addons_total` is the accessory extra PER UNIT:
--   line_total = (unit_price + addons_total) * quantity
-- ============================================================
alter table public.products
  add column if not exists is_customizable boolean not null default false;

update public.products
   set is_customizable = true
 where is_customizable = false
   and coalesce(category, '') ilike '%cake%';

alter table public.order_items
  add column if not exists customization jsonb;
alter table public.order_items
  add column if not exists addons_total numeric(10,2) not null default 0;


-- ============================================================
-- 5. NOTIFICATION CONFIG
-- ------------------------------------------------------------
-- Customer email (Resend) + owner WhatsApp (Meta Cloud API) credentials, on
-- the single site_settings row, same shape as `stripe_config`. Secrets are
-- ENCRYPTED at rest by the app (lib/crypto) and never returned to the browser.
-- Absent / empty = notifications are simply skipped; an order is never failed
-- because a message couldn't be sent.
-- ============================================================
alter table public.site_settings
  add column if not exists notification_config jsonb not null default '{}'::jsonb;


-- ============================================================
-- 6. ROW LEVEL SECURITY
-- ------------------------------------------------------------
-- Public reads of ACTIVE rows only (the storefront must render and price the
-- wizard). Writes go through the service role, which bypasses RLS entirely —
-- the admin panel is the only writer, and every price is re-read server-side
-- at checkout, so a tampered client can never buy a £6 topper for £0.
-- ============================================================
alter table public.accessory_categories enable row level security;
alter table public.accessories          enable row level security;

drop policy if exists "cake_accessory_groups public read"  on public.accessory_categories;
drop policy if exists "accessory_categories public read"   on public.accessory_categories;
create policy "accessory_categories public read"
  on public.accessory_categories for select
  using (active = true);

drop policy if exists "cake_accessory_options public read" on public.accessories;
drop policy if exists "accessories public read"            on public.accessories;
create policy "accessories public read"
  on public.accessories for select
  using (active = true);


-- ============================================================
-- 7. SEED — the launch catalogue
-- ------------------------------------------------------------
-- Illustrative content, NOT a code dependency: every row below can be renamed,
-- repriced, reordered, disabled or deleted from the admin panel, and the
-- customization page follows. ON CONFLICT DO NOTHING means a re-run never
-- clobbers the admin's edits.
--
-- The keys deliberately MATCH 21's, so a database that already ran 21 keeps
-- its rows (and its orders' saved selections) rather than gaining a second,
-- near-identical set of categories. The quantity categories are the new ones.
-- ============================================================
insert into public.accessory_categories
  (key, name, display_type, description, placeholder, price, required, max_chars,
   min_qty, max_qty, depends_on_key, depends_on_value, sort_order)
values
  ('candles', 'Candles', 'radio',
   'Every celebration needs a flame.', null, 0, true, null, 0, 10, null, null, 10),

  ('cake_message', 'Message on the cake', 'text',
   'Piped by hand on top of your cake.', 'Happy Birthday, Mum!', 0, false, 30,
   0, 10, null, null, 20),

  ('cake_topper', 'Cake topper', 'dropdown',
   null, null, 0, false, null, 0, 10, null, null, 30),

  ('custom_topper_text', 'Your topper wording', 'text',
   'Tell us exactly what the topper should say.', 'You did it, Sam!', 0, true, 40,
   0, 10, 'cake_topper', 'custom', 40),

  ('greeting_card', 'Greeting card', 'toggle',
   'A handwritten card, tucked in beside the cake.', null, 2.50, false, null,
   0, 10, null, null, 50),

  ('greeting_card_message', 'Card message', 'textarea',
   'We''ll write this inside the card for you.', 'Wishing you the sweetest day…',
   0, true, 200, 0, 10, 'greeting_card', 'yes', 60),

  ('extra_name', 'Extra name on the cake', 'text',
   null, 'Priya', 1.50, false, 30, 0, 10, null, null, 70),

  ('party_decorations', 'Party decorations', 'checkbox',
   'Pick as many as you like.', null, 0, false, null, 0, 10, null, null, 80),

  ('balloons', 'Balloons', 'quantity',
   'How many of each?', null, 0, false, null, 0, 20, null, null, 90),

  ('flowers', 'Flowers', 'quantity',
   'Fresh stems, arranged the morning of delivery.', null, 0, false, null,
   0, 12, null, null, 100),

  ('chocolates', 'Chocolates', 'quantity',
   null, null, 0, false, null, 0, 20, null, null, 110),

  ('macarons', 'Macarons', 'quantity',
   'Sold individually — mix and match.', null, 0, false, null, 0, 24, null, null, 120),

  ('knife', 'Cake knife', 'toggle',
   'A serving knife, boxed with your cake.', null, 1.50, false, null,
   0, 10, null, null, 130),

  ('birthday_cap', 'Birthday cap', 'toggle',
   null, null, 1.00, false, null, 0, 10, null, null, 140),

  ('gift_wrap', 'Gift wrap', 'toggle',
   'Wrapped in our ribboned blush paper.', null, 3.00, false, null,
   0, 10, null, null, 150),

  ('delivery_notes', 'Delivery notes', 'textarea',
   'Gate codes, buzzer numbers, "leave with next door" — anything we should know.',
   'Ring the top bell, the dog barks but he''s friendly.', 0, false, 300,
   0, 10, null, null, 160)
on conflict (key) do nothing;


-- The items inside each category, resolved by key so this is independent of
-- the generated uuids above.
insert into public.accessories
  (category_id, value, name, description, price, min_qty, max_qty, is_default, sort_order)
select c.id, v.value, v.name, v.description, v.price, v.min_qty, v.max_qty,
       v.is_default, v.sort_order
  from public.accessory_categories c
  join (values
    ('candles', 'none',     'None',          null,                          0.00, 1, 1,  true,  10),
    ('candles', 'magic',    'Magic candle',  'Relights itself — every time.', 2.50, 1, 1, false, 20),
    ('candles', 'number',   'Number candle', 'Tell us the age in the cake message.', 1.50, 1, 1, false, 30),
    ('candles', 'sparkler', 'Sparkler',      'A shower of cold sparks.',     3.00, 1, 1,  false, 40),

    ('cake_topper', 'none',           'No topper',         null, 0.00, 1, 1, true,  10),
    ('cake_topper', 'happy_birthday', 'Happy Birthday',    null, 4.00, 1, 1, false, 20),
    ('cake_topper', 'anniversary',    'Happy Anniversary', null, 4.00, 1, 1, false, 30),
    ('cake_topper', 'congrats',       'Congratulations',   null, 4.00, 1, 1, false, 40),
    ('cake_topper', 'custom',         'Custom wording',    'We''ll cut it to your words.', 6.00, 1, 1, false, 50),

    ('party_decorations', 'banner',     'Happy Birthday banner', null, 3.50, 1, 1, false, 10),
    ('party_decorations', 'confetti',   'Table confetti',        null, 2.00, 1, 1, false, 20),
    ('party_decorations', 'party_hats', 'Party hats (set of 4)', null, 3.00, 1, 1, false, 30),

    ('balloons', 'latex_blush', 'Blush latex balloon',  null, 1.00, 1, 20, false, 10),
    ('balloons', 'foil_number', 'Foil number balloon',  'Tell us the digit in the cake message.', 3.50, 1, 5, false, 20),
    ('balloons', 'heart',       'Heart balloon',        null, 1.50, 1, 20, false, 30),

    ('flowers', 'rose',   'Rose stem',        null, 2.50, 1, 12, false, 10),
    ('flowers', 'peony',  'Peony stem',       null, 4.00, 1, 12, false, 20),
    ('flowers', 'posy',   'Dried posy',       'Keeps long after the cake is gone.', 6.00, 1, 4, false, 30),

    ('chocolates', 'truffle', 'Salted caramel truffle', null, 1.25, 1, 20, false, 10),
    ('chocolates', 'praline', 'Hazelnut praline',       null, 1.25, 1, 20, false, 20),

    ('macarons', 'pistachio', 'Pistachio macaron', null, 1.75, 1, 24, false, 10),
    ('macarons', 'raspberry', 'Raspberry macaron', null, 1.75, 1, 24, false, 20),
    ('macarons', 'vanilla',   'Vanilla macaron',   null, 1.75, 1, 24, false, 30)
  ) as v(category_key, value, name, description, price, min_qty, max_qty, is_default, sort_order)
    on v.category_key = c.key
on conflict (category_id, value) do nothing;
