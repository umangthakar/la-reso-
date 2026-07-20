-- ============================================================
-- LE RASA BAKERY — Custom Cake Inquiries.
-- ------------------------------------------------------------
-- Paste-and-run in the Supabase SQL Editor. IDEMPOTENT and ADDITIVE — safe
-- to run repeatedly. Creates the persistence layer behind the Custom Cake
-- Inquiry form: every submission is saved with a UNIQUE, human-readable
-- Inquiry Number that resets each day (CQ-YYYYMMDD-001, -002 …).
--
-- Access model mirrors `orders`: RLS locked down (no anon policies); every
-- read/write goes through a service-role API route that scopes a customer to
-- their own session email. The admin panel uses the service role too.
--
--   1. custom_inquiries          (one row per inquiry)
--   2. inquiry_number_counters   (per-day sequence, atomic)
--   3. set_inquiry_number()      (BEFORE INSERT trigger → CQ-YYYYMMDD-NNN)
-- ============================================================


-- ------------------------------------------------------------
-- 1. INQUIRIES TABLE
--    `inquiry_number` is assigned by the trigger below (never trusted from the
--    client). `converted_order_id` is reserved for the FUTURE "Convert to
--    Order" feature — nullable now, so that feature needs no schema change.
-- ------------------------------------------------------------
create table if not exists public.custom_inquiries (
  id                  uuid primary key default gen_random_uuid(),
  inquiry_number      text unique,
  -- Who it belongs to (for the customer's history). Set to the signed-in
  -- session email when logged in; null for a guest inquiry.
  customer_email      text,
  -- Contact + cake details as submitted.
  name                text not null default '',
  phone               text not null default '',
  email               text not null default '',
  event_type          text not null default '',
  delivery_date       text not null default '',
  servings            text not null default '',
  budget              text not null default '',
  flavour             text not null default '',
  shape               text not null default '',
  colour_theme        text not null default '',
  cake_message        text not null default '',
  notes               text not null default '',
  reference_images    jsonb not null default '[]'::jsonb,
  -- Lifecycle: new → contacted → confirmed → closed (or cancelled).
  status              text not null default 'new',
  contacted_at        timestamptz,
  confirmed_at        timestamptz,
  closed_at           timestamptz,
  cancelled_at        timestamptz,
  -- FUTURE: the order this inquiry became (kept nullable + unconstrained so
  -- "Convert to Order" can be added later with zero schema change).
  converted_order_id  uuid,
  created_at          timestamptz not null default now()
);

create index if not exists custom_inquiries_customer_email_idx
  on public.custom_inquiries (customer_email, created_at desc);
create index if not exists custom_inquiries_status_idx
  on public.custom_inquiries (status, created_at desc);
create index if not exists custom_inquiries_number_idx
  on public.custom_inquiries (inquiry_number);


-- ------------------------------------------------------------
-- 2. PER-DAY COUNTER — one row per calendar day (Europe/London), holding the
--    last sequence handed out. The upsert in the trigger locks the row, so
--    concurrent inserts get consecutive numbers with no gaps or collisions.
-- ------------------------------------------------------------
create table if not exists public.inquiry_number_counters (
  day       date primary key,
  last_seq  integer not null default 0
);


-- ------------------------------------------------------------
-- 3. TRIGGER — assign CQ-YYYYMMDD-NNN on insert (unless one was supplied,
--    which lets a future migration/import preserve existing numbers).
-- ------------------------------------------------------------
create or replace function public.set_inquiry_number()
returns trigger
language plpgsql
as $$
declare
  d   date;
  seq integer;
begin
  if new.inquiry_number is not null and new.inquiry_number <> '' then
    return new;
  end if;

  d := (now() at time zone 'Europe/London')::date;

  insert into public.inquiry_number_counters (day, last_seq)
    values (d, 1)
    on conflict (day)
    do update set last_seq = public.inquiry_number_counters.last_seq + 1
    returning last_seq into seq;

  new.inquiry_number := 'CQ-' || to_char(d, 'YYYYMMDD') || '-' || lpad(seq::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists trg_set_inquiry_number on public.custom_inquiries;
create trigger trg_set_inquiry_number
  before insert on public.custom_inquiries
  for each row execute function public.set_inquiry_number();


-- ------------------------------------------------------------
-- 4. ROW LEVEL SECURITY — locked down. Anon/auth clients get NOTHING; all
--    access is via service-role API routes (scoped to the caller). Same
--    posture as `orders`.
-- ------------------------------------------------------------
alter table public.custom_inquiries       enable row level security;
alter table public.inquiry_number_counters enable row level security;
-- (No policies added → only the service role can read/write.)
