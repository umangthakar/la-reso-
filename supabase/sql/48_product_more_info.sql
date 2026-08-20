-- ============================================================
-- LE RASA BAKERY — Product More Information blocks.
-- ------------------------------------------------------------
-- Paste-and-run in the Supabase SQL Editor. Fully IDEMPOTENT and
-- ADDITIVE — safe to run repeatedly and safe on the live database
-- without touching existing products, orders or checkout.
--
-- Adds a single nullable jsonb column to the products table.
-- Handles the case where 'products' might be a view (error 42P16).
-- Existing products get NULL (no more information), so nothing new
-- is shown for them and the storefront + admin degrade gracefully
-- when this migration hasn't been run. More Information is entirely
-- optional and never required to save a product.
--
-- Shape of the stored value (array of blocks, ordered):
--   [
--     { "title": "Please note", "content": "The figurines are attached..." },
--     { "title": "Delivery", "content": "Please ensure someone is..." }
--   ]
-- ============================================================

DO $$
DECLARE
  v_obj_type text;
  v_table_name text := 'products';
  v_schema_name text := 'public';
  v_column_name text := 'more_info';
BEGIN
  -- Check if 'products' exists and what type it is (table or view)
  SELECT c.relkind
  INTO v_obj_type
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = v_schema_name
    AND c.relname = v_table_name;

  IF v_obj_type IS NULL THEN
    RAISE EXCEPTION 'Object % does not exist in schema %', v_table_name, v_schema_name;
  END IF;

  IF v_obj_type = 'r' THEN
    -- It's a regular table - safe to add column
    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS %I jsonb', v_schema_name, v_table_name, v_column_name);
    RAISE NOTICE 'Added column % to table %.%', v_column_name, v_schema_name, v_table_name;
  ELSIF v_obj_type = 'v' THEN
    -- It's a view - we need to find the underlying table
    -- Check for a table with the same name in a different schema, or a base table
    RAISE EXCEPTION 'products is a VIEW (relkind=v), not a TABLE. Cannot ALTER TABLE a view. 
    Please check if there is a view named "products" in the public schema that shadows the table.
    The underlying table may need the column added instead, then the view recreated with the new column appended.';
  ELSIF v_obj_type = 'm' THEN
    -- Materialized view
    RAISE EXCEPTION 'products is a MATERIALIZED VIEW (relkind=m). Cannot ALTER TABLE a materialized view.';
  ELSIF v_obj_type = 'f' THEN
    -- Foreign table
    EXECUTE format('ALTER FOREIGN TABLE %I.%I ADD COLUMN IF NOT EXISTS %I jsonb', v_schema_name, v_table_name, v_column_name);
    RAISE NOTICE 'Added column % to foreign table %.%', v_column_name, v_schema_name, v_table_name;
  ELSE
    RAISE EXCEPTION 'Unexpected object type % for %.%', v_obj_type, v_schema_name, v_table_name;
  END IF;
END $$;

-- Public read is already covered by the existing products SELECT policy
-- (the storefront reads this column with the anon client). All writes go
-- through the service-role admin API, which bypasses RLS. No new table,
-- policy or index is required.