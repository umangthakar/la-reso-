-- ============================================================
-- LE RASA BAKERY — 41_category_delete.sql
-- ------------------------------------------------------------
-- Transactional support for deleting a category from the admin
-- Categories panel (DELETE /api/admin/products/categories).
--
-- WHAT DELETING A CATEGORY NOW MEANS
--
--   Cakes                      <- deleting this
--   ├── Custom Cakes           <- KEPT, becomes top level
--   └── Wedding Cake           <- KEPT, becomes top level
--
--   * products filed DIRECTLY under "Cakes"          -> DELETED
--   * products filed under Custom Cakes / Wedding Cake -> UNTOUCHED
--   * the child categories themselves                -> KEPT, promoted to
--     top level (their entry in category_parents is removed, which is this
--     system's "parent_id = NULL": see 40_category_hierarchy.sql)
--
-- WHY THIS EXISTS. Categories are NOT a table — they are a jsonb string[] on
-- site_settings plus a { child: parent } map beside it, and products reference
-- them BY NAME. So one delete touches four things that must not come apart:
-- the child rows' parents, the products, their extras (images/sizes, via FK
-- cascade), and the two jsonb columns. Done as separate PostgREST calls there
-- is a window in which the products are gone but the category is still listed,
-- or the children are orphaned under a parent that no longer exists. This
-- function does all of it in ONE statement inside ONE transaction: it either
-- all lands, or nothing does.
--
-- The site_settings row is locked FOR UPDATE, so a concurrent add/rename/
-- re-parent from another admin tab waits rather than overwriting the result.
--
-- IMAGES. The function does not touch Storage (Postgres cannot). It RETURNS
-- the image urls that no surviving product references any more, and the API
-- route removes those objects from the product-images bucket afterwards. The
-- filtering happens after the delete, so a file still used by a product in
-- another category is never handed back for removal.
--
-- Paste-and-run in the Supabase SQL Editor. Fully IDEMPOTENT and ADDITIVE —
-- safe to run repeatedly and safe on the live database. Nothing is deleted by
-- running it; it only creates the function the admin panel calls.
--
-- ⚠ IF YOU ALREADY RAN AN EARLIER COPY OF THIS FILE, RUN IT AGAIN. The first
-- version declared v_settings_id as uuid, but site_settings.id is an INTEGER on
-- this database, so every delete failed on the first statement with
-- "invalid input syntax for type uuid: 1" and nothing was ever deleted.
-- `create or replace` overwrites the old function in place.
-- ============================================================

-- ------------------------------------------------------------
-- 0. DEPENDENCY — the hierarchy column (40_category_hierarchy.sql).
--
-- Repeated here (identical, `if not exists`) so this migration is
-- self-sufficient: the function reads and writes category_parents, and a
-- database that skipped 40 must not end up with a function that always fails.
-- ------------------------------------------------------------
alter table public.site_settings
  add column if not exists category_parents jsonb not null default '{}'::jsonb;

-- ------------------------------------------------------------
-- 1. THE DELETE — one transaction, five steps.
--
-- Steps, in the order they must happen:
--   1. resolve the name against the curated list (case-insensitively, the same
--      way lib/category-hierarchy.ts `canonical` does), falling back to a name
--      that only exists on products;
--   2. collect the image urls of the products about to go;
--   3. promote the direct children to top level;
--   4. delete the products filed DIRECTLY under the category — product_images
--      and product_sizes follow by ON DELETE CASCADE (26_product_variants.sql),
--      offer_product_rules likewise (15_offers.sql), and order_items keep their
--      history because their product_id is ON DELETE SET NULL (00_full_setup);
--   5. drop the category from the list and from the parent map.
--
-- Products are matched by EXACT name, exactly like the rename path
-- (`update products set category = ... where category = oldName`), so this can
-- never reach a product the admin panel counts under a different row.
--
-- Returns, for the confirmation the admin sees afterwards:
--   { category, deleted_products, promoted_children[], image_urls[] }
-- ------------------------------------------------------------
create or replace function public.delete_category_cascade(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name        text := nullif(btrim(coalesce(p_name, '')), '');
  -- TEXT, not uuid: site_settings.id is a uuid in 00_full_setup.sql but an
  -- integer on the live database (the single row is id = 1). Declaring the
  -- variable as uuid made the very first SELECT ... INTO fail with
  -- "invalid input syntax for type uuid: 1" — before any of the logic below —
  -- so EVERY delete came back 500 whatever category it named. Holding the key
  -- as text and matching on id::text works whichever type the column is.
  v_settings_id text;
  v_categories  jsonb;
  v_parents     jsonb;
  v_target      text;
  v_children    text[] := '{}';
  v_candidates  text[] := '{}';
  v_gallery     text[] := '{}';
  v_images      text[] := '{}';
  v_deleted     integer := 0;
begin
  if v_name is null then
    raise exception 'A category name is required' using errcode = '22023';
  end if;

  -- Lock the settings row for the whole transaction. `limit 1` (unordered)
  -- mirrors how every other reader of this table selects it — there is exactly
  -- one row. A database with no settings row yet still works: the product side
  -- runs and the jsonb writes are skipped.
  select id::text, coalesce(categories, '[]'::jsonb), coalesce(category_parents, '{}'::jsonb)
    into v_settings_id, v_categories, v_parents
    from public.site_settings
   limit 1
     for update;

  v_categories := coalesce(v_categories, '[]'::jsonb);
  v_parents    := coalesce(v_parents, '{}'::jsonb);

  -- --- 1. resolve the canonical name -------------------------------------
  select t.value
    into v_target
    from jsonb_array_elements_text(v_categories) as t(value)
   where lower(t.value) = lower(v_name)
   limit 1;

  if v_target is null then
    -- Not in the curated list — it may exist only because products carry it.
    select p.category
      into v_target
      from public.products p
     where lower(p.category) = lower(v_name)
     limit 1;
  end if;

  if v_target is null then
    raise exception '"%" is not a category.', v_name using errcode = 'P0002';
  end if;

  -- --- 2. candidate image files ------------------------------------------
  -- Gathered BEFORE the delete (afterwards the rows are gone), narrowed to
  -- genuinely unreferenced files AFTER it.
  select coalesce(array_agg(distinct p.image_url), '{}')
    into v_candidates
    from public.products p
   where p.category = v_target
     and nullif(btrim(coalesce(p.image_url, '')), '') is not null;

  if to_regclass('public.product_images') is not null then
    execute $q$
      select coalesce(array_agg(distinct pi.url), '{}')
        from public.product_images pi
        join public.products p on p.id = pi.product_id
       where p.category = $1::text
         and nullif(btrim(coalesce(pi.url, '')), '') is not null
    $q$
    into v_gallery
    using v_target;

    v_candidates := array(select distinct u from unnest(v_candidates || v_gallery) as u);
  end if;

  -- --- 3. promote the direct children to top level ------------------------
  -- Their products are NOT touched: a category keeps everything filed under it
  -- when its parent changes (the same rule the PATCH re-parent path follows).
  select coalesce(array_agg(e.key order by e.key), '{}')
    into v_children
    from jsonb_each_text(v_parents) as e
   where e.value = v_target;

  -- Removing a key IS "parent = NULL" here; the category's own parent link goes
  -- too, so the map never keeps a dangling entry.
  v_parents := (v_parents - v_children) - v_target;

  -- --- 4. delete the products filed directly under it ---------------------
  with gone as (
    delete from public.products
     where category = v_target
    returning 1
  )
  select count(*) into v_deleted from gone;

  -- Offer rules naming this category would otherwise point at nothing. An
  -- offer scoped to categories matches on the include set, so losing a rule
  -- narrows that offer — it can never widen one.
  if to_regclass('public.offer_category_rules') is not null then
    execute 'delete from public.offer_category_rules where category = $1' using v_target;
  end if;

  -- --- 5. drop the category itself ----------------------------------------
  if v_settings_id is not null then
    update public.site_settings
       set categories = (
             select coalesce(jsonb_agg(t.value order by t.ord), '[]'::jsonb)
               from jsonb_array_elements_text(v_categories) with ordinality as t(value, ord)
              where t.value <> v_target
           ),
           category_parents = v_parents
     where id::text = v_settings_id;
  end if;

  -- --- files no surviving product references any more ---------------------
  select coalesce(array_agg(u), '{}')
    into v_images
    from unnest(v_candidates) as u
   where not exists (select 1 from public.products p where p.image_url = u);

  if to_regclass('public.product_images') is not null then
    execute $q$
      -- $1 is cast explicitly: unnest() is polymorphic, so without it the
      -- planner cannot infer the parameter's type.
      select coalesce(array_agg(u), '{}')
        from unnest($1::text[]) as u
       where not exists (select 1 from public.product_images pi where pi.url = u)
    $q$
    into v_images
    using v_images;
  end if;

  return jsonb_build_object(
    'category',          v_target,
    'deleted_products',  v_deleted,
    'promoted_children', to_jsonb(v_children),
    'image_urls',        to_jsonb(v_images)
  );
end;
$$;

comment on function public.delete_category_cascade(text) is
  'Delete a category in one transaction: promote its direct child categories to '
  'top level (parent removed), delete only the products filed DIRECTLY under it '
  '(extras cascade), drop it from site_settings.categories and category_parents, '
  'and return the image urls no surviving product references so the caller can '
  'remove those Storage objects.';

-- ------------------------------------------------------------
-- 2. GRANTS — server-side callers only.
--
-- SECURITY DEFINER and destructive, so EXECUTE is revoked from the
-- browser-facing roles and granted only to service_role — the key the
-- password-gated admin route uses. PUBLIC is revoked first because Postgres
-- grants EXECUTE to PUBLIC by default.
-- ------------------------------------------------------------
revoke all on function public.delete_category_cascade(text) from public;
revoke all on function public.delete_category_cascade(text) from anon, authenticated;
grant execute on function public.delete_category_cascade(text) to service_role;

-- ------------------------------------------------------------
-- 3. Make PostgREST pick the new function up immediately instead of waiting
--    for its schema cache to expire (otherwise the first call comes back
--    "Could not find the function ... in the schema cache").
-- ------------------------------------------------------------
notify pgrst, 'reload schema';
