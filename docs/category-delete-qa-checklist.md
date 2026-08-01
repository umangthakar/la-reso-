# Category Deletion — Manual QA Checklist

Run this **after** pasting `supabase/sql/41_category_delete.sql` into the
Supabase SQL Editor (it also (re-)adds the `category_parents` column from
`40_category_hierarchy.sql`, so running 41 alone is enough).

Until 41 is applied, the Delete button returns a friendly 409 —
*"Category deletion isn't set up on this database yet… Nothing was deleted."* —
and **nothing is touched**. That is the intended pre-migration behaviour: there
is no non-transactional fallback, because a half-finished cascade is worse than
a refusal.

Legend: ▢ = to verify.

---

## 0. Set up the scenario (Admin → Products → Categories)

```
Cakes
├── Custom Cakes
└── Wedding Cake
```

- ▢ Create `Cakes` (Parent: None), then `Custom Cakes` and `Wedding Cake` with
  **Parent: Cakes**.
- ▢ Add products: 2 in `Cakes` (each with an uploaded image — one with several
  gallery images and a size variant), 1 in `Custom Cakes`, 1 in `Wedding Cake`.

## 1. The confirmation dialog

- ▢ Click **Delete** on `Cakes`. A dialog appears listing **Category: Cakes**,
  **Products to delete: 2**, **Child categories: 2**, the note that child
  categories become top level, and *"This action cannot be undone."*
- ▢ **Cancel** closes it and deletes nothing (list unchanged, product count
  unchanged).
- ▢ Re-open and click **Delete Forever**: the button reads *Deleting…* and is
  disabled — a second click sends nothing.

## 2. The delete itself

- ▢ Success notice reads *"Category deleted successfully. 2 products removed.
  2 child categories moved to top level."*
- ▢ `Cakes` is gone from the Categories list, from the product form's Category
  dropdown, and from the storefront menu tabs (`/menu`).
- ▢ `Custom Cakes` and `Wedding Cake` are **still there**, now at depth 0
  (no `└` indent, **Parent: None** in their picker).
- ▢ Their products are **still there** and still filed under them — check the
  product table filtered by each, and the storefront category tabs.
- ▢ The 2 products that were directly in `Cakes` are gone from the product
  table and from `/menu`.

## 3. Files

- ▢ In Supabase Storage → `product-images`, the objects belonging to the two
  deleted products (main image **and** gallery images) are gone.
- ▢ Every image still shown by a surviving product still loads — a file shared
  with a product outside the deleted category is never removed (the function
  only returns urls nothing references any more).
- ▢ If Storage refuses, the notice names the leftover object keys to remove by
  hand. The rows are already deleted at that point — that is deliberate: a file
  outliving its row is a tidy-up, a row outliving its file is a broken image.

## 4. Edge cases

- ▢ **No products, no children** — deletes, notice says *0 products removed.
  0 child categories moved to top level.*
- ▢ **Children but no products** — children survive and are promoted; 0
  products removed.
- ▢ **Products but no children** — products go; nothing else changes.
- ▢ **Child of a child** — deleting `Cakes` promotes only its DIRECT children;
  a grandchild stays under its own parent (which is now top level).
- ▢ **Unknown name** (e.g. via curl with a name that isn't a category) → 404
  *"…is not a category."*, nothing deleted.
- ▢ **Re-parenting still works** — the Parent dropdown on any row still moves a
  category without moving its products.
- ▢ **Rename still works** — renaming updates every product filed under it and
  keeps the tree shape.

## 5. Integrity

- ▢ Past orders that contained a deleted product still open and still show
  their line items (`order_items.product_id` is `ON DELETE SET NULL`; the name
  and price on the line item are kept).
- ▢ No `product_images` / `product_sizes` rows survive for the deleted products
  (FK cascade):
  ```sql
  select count(*) from product_images pi
   where not exists (select 1 from products p where p.id = pi.product_id);
  -- expect 0 (same for product_sizes)
  ```
- ▢ `category_parents` holds no key or value naming the deleted category:
  ```sql
  select category_parents from site_settings;
  ```
- ▢ An offer scoped to the deleted category lost that rule and now matches
  nothing extra (it can only narrow, never widen).

## 6. Atomicity

- ▢ The whole database half is one statement
  (`select delete_category_cascade('Cakes')`), so an error anywhere inside it
  rolls **everything** back: no half-promoted children, no products deleted
  without the category going, no category removed while its products remain.
  To see the rollback, run it in the SQL Editor wrapped in
  `begin; select delete_category_cascade('Cakes'); rollback;` and confirm the
  category, its products and its children are all still present afterwards.
