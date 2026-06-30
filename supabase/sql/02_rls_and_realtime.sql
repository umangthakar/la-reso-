-- ============================================================
-- LE RASA BAKERY — RLS POLICIES + REAL-TIME SETUP
-- Run AFTER 01_schema.sql
-- ============================================================

-- ------------------------------------------------------------
-- ENABLE RLS ON ALL TABLES
-- ------------------------------------------------------------
alter table categories enable row level security;
alter table products enable row level security;
alter table delivery_zones enable row level security;
alter table delivery_settings enable row level security;
alter table blocked_dates enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_status_history enable row level security;
alter table invoices enable row level security;
alter table cake_inquiries enable row level security;
alter table site_settings enable row level security;

-- ------------------------------------------------------------
-- PUBLIC READ — catalogue/storefront data (no auth needed)
-- ------------------------------------------------------------
create policy "Public can view categories"
  on categories for select using (true);

create policy "Public can view visible in-stock products"
  on products for select
  using (hidden = false);
  -- Note: out-of-stock products still shown (so "Currently Unavailable" displays),
  -- only `hidden` products are excluded from public queries

create policy "Public can view active delivery zones"
  on delivery_zones for select using (active = true);

create policy "Public can view delivery settings"
  on delivery_settings for select using (true);

create policy "Public can view blocked dates"
  on blocked_dates for select using (true);

create policy "Public can view site settings"
  on site_settings for select using (true);

-- ------------------------------------------------------------
-- ORDERS — the critical real-time security boundary
-- Customers can only see/subscribe to THEIR OWN order,
-- looked up via tracking_token (no login required) or auth_user_id
-- ------------------------------------------------------------

-- Anyone can INSERT an order (checkout flow — guest or logged in)
create policy "Anyone can create an order"
  on orders for insert
  with check (true);

-- Customers can view their own order via tracking_token match
-- (tracking_token is passed as a request header/claim from the tracking page)
create policy "Customer can view own order by tracking token"
  on orders for select
  using (
    tracking_token = current_setting('request.headers', true)::json->>'x-tracking-token'
    or
    (customer_id is not null and customer_id = (
      select id from customers where auth_user_id = auth.uid()
    ))
  );

-- ------------------------------------------------------------
-- ORDER STATUS HISTORY — same boundary as orders
-- This is the table the tracking page subscribes to in real-time
-- ------------------------------------------------------------
create policy "Customer can view own order status history"
  on order_status_history for select
  using (
    order_id in (
      select id from orders
      where tracking_token = current_setting('request.headers', true)::json->>'x-tracking-token'
      or (customer_id is not null and customer_id = (
        select id from customers where auth_user_id = auth.uid()
      ))
    )
  );

-- ------------------------------------------------------------
-- ORDER ITEMS — same boundary
-- ------------------------------------------------------------
create policy "Customer can view own order items"
  on order_items for select
  using (
    order_id in (
      select id from orders
      where tracking_token = current_setting('request.headers', true)::json->>'x-tracking-token'
      or (customer_id is not null and customer_id = (
        select id from customers where auth_user_id = auth.uid()
      ))
    )
  );

-- ------------------------------------------------------------
-- INVOICES — same boundary
-- ------------------------------------------------------------
create policy "Customer can view own invoice"
  on invoices for select
  using (
    order_id in (
      select id from orders
      where tracking_token = current_setting('request.headers', true)::json->>'x-tracking-token'
      or (customer_id is not null and customer_id = (
        select id from customers where auth_user_id = auth.uid()
      ))
    )
  );

-- ------------------------------------------------------------
-- CUSTOMERS — logged-in customers manage their own row only
-- ------------------------------------------------------------
create policy "Customer can view own profile"
  on customers for select
  using (auth_user_id = auth.uid());

create policy "Customer can update own profile"
  on customers for update
  using (auth_user_id = auth.uid());

create policy "Anyone can create a customer record"
  on customers for insert
  with check (true);

-- ------------------------------------------------------------
-- CAKE INQUIRIES — anyone can submit, only admin can view (handled below)
-- ------------------------------------------------------------
create policy "Anyone can submit a cake inquiry"
  on cake_inquiries for insert
  with check (true);

-- ------------------------------------------------------------
-- ADMIN ACCESS — full read/write on everything via service role
-- Your Next.js admin panel should use the SUPABASE SERVICE ROLE KEY
-- (server-side only, never exposed to browser) which bypasses RLS
-- entirely. No admin-specific policies needed below — the service
-- role key already has full access by default.
--
-- IMPORTANT: never use the service role key in client-side code.
-- Admin panel routes must be server-side (API routes / server actions)
-- that check admin auth, THEN use the service role key to query.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- ENABLE REAL-TIME ON THE THREE LIVE TABLES
-- (Supabase real-time works via Postgres logical replication —
-- this adds the tables to the publication that broadcasts changes)
-- ------------------------------------------------------------
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_status_history;
alter publication supabase_realtime add table products;
