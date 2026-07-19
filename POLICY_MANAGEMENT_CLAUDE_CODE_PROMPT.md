# Le Rasa Bakery — Policy Management System
### Claude Code implementation prompt — one-click phases

Each phase below is now a SINGLE, self-contained code block: ground rules +
that phase's instructions, all in one. Click the copy icon on a phase's
block, paste it into Claude Code, and go — no assembling multiple blocks by
hand. Still run them in order, one at a time, and only after the previous
phase builds clean and you've reviewed the diff.

**Before you paste Phase 1:** this repo's currently checked-out branch is
`feat/offer-management-system`, with uncommitted local changes to
`components/menu-grid.tsx` and `components/rotating-banners.tsx`. Your
requirement is to work only on `main` and never create/switch branches.
Every phase below makes Claude Code check this and STOP rather than guess —
but decide first (finish/commit that branch, merge to main, or otherwise)
before you paste anything.

---

## PHASE 1 — Database schema, migration, RLS

```
You are working in the Le Rasa Bakery repo: Next.js 14 (App Router) +
TypeScript + Supabase (Postgres, service-role admin client, anon client with
RLS). This task adds a Policy Management System (Privacy Policy, Delivery
Policy, Refund Policy, Terms & Conditions, etc.) fully admin-managed.

GIT SAFETY — READ FIRST, DO NOT SKIP
- Run `git branch --show-current` and `git status -sb` before touching any
  file.
- Work ONLY on `main`. Do NOT run `git checkout -b` / create any feature
  branch, and do NOT switch to a different existing branch on your own.
- If the current branch is not `main`, or there are uncommitted changes
  present, STOP and report exactly what you found (branch name + `git
  status` output) and ask how to proceed. Do not stash, discard, commit, or
  merge anything automatically to "fix" this.
- Do NOT commit or push anything unless explicitly asked to in that
  specific message, and even then only to `main`.

READ FIRST (defines conventions to follow, not just background):
- lib/admin-auth.ts + lib/admin-api.ts — admin auth pattern
  (isAuthedRequest() server-side; adminGet/adminSend/adminUpload
  client-side).
- app/api/admin/products/route.ts, app/api/admin/products/[id]/route.ts,
  app/api/admin/products/reorder/route.ts — CRUD + drag-reorder route shape
  to mirror later.
- app/admin/dashboard/layout.tsx — sidebar NAV array (~line 24-33), where a
  new "Policies" entry will go later (after "Content & Settings", before
  "Analytics").
- lib/slug.ts — existing slugify() helper. Policies get a REAL `slug`
  column from the start (unlike /menu/[slug], which derives slugs
  client-side because products have no slug column) — slugify() is only an
  input-assist later, never client-side lookup logic.
- supabase/sql/ — latest numbered migration is
  supabase/sql/18_offer_banner_popup.sql. This phase adds
  supabase/sql/19_policies.sql, additive only, following the exact style of
  every prior numbered file (guarded `create table if not exists`, RLS
  enabled + policies at the bottom). Do not edit 00_full_setup.sql or any
  other existing migration.

GROUND RULES (apply to this phase and every later one)
- Do NOT redesign the site. Do NOT change fonts, colors, spacing, or layout
  of anything outside the specific section being replaced/added.
- Extend the existing architecture only — same admin auth pattern, same
  adminGet/adminSend client helper, same service-role-bypasses-RLS
  admin-panel model, same migration-file numbering convention.
- Everything about a policy (content, slug, order, enabled state, button
  text) must be editable from the admin panel — no hardcoded policy text or
  list anywhere in the codebase.
- After this phase: run `npm run build` (or `tsc --noEmit`) and fix any
  type errors before stopping. Report a short summary of files changed and
  STOP — do not proceed to the next phase automatically.
- Stop and ask before: deleting any file, adding any npm dependency, editing
  supabase/sql/00_full_setup.sql, or touching the Offer Management System's
  files (lib/offers.ts, app/api/**/offers/**, app/admin/dashboard/offers/**)
  — that system is unrelated to this task.

GOAL FOR THIS PHASE
New migration file supabase/sql/19_policies.sql (additive only).

TABLE

policies
- id uuid pk default gen_random_uuid()
- title text not null
- short_description text not null default ''
- content text not null default ''            -- Markdown source
- read_more_text text not null default 'Read More'
- slug text not null unique                    -- e.g. 'privacy-policy'
- display_order integer not null default 0
- enabled boolean not null default true
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()

Add a check constraint on slug format (lowercase letters, numbers, hyphens
only) so a bad manual edit can't produce a broken URL:
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')

INDEXES
- unique index on slug (already implied by `unique`, but note in a migration
  comment that this is the lookup key for /policies/[slug]).
- index on (enabled, display_order) — the public storefront query (enabled
  policies, in order), run on every page's footer.

RLS
- Enable RLS on policies.
- Public (anon) SELECT policy: `using (enabled = true)` — same trust level
  and pattern as "Public read visible products" in 00_full_setup.sql. No
  public INSERT/UPDATE/DELETE (admin panel uses the service role, which
  bypasses RLS, exactly like every other admin table).

SEED
Do not hardcode seed rows in application code. If you want the four example
slugs (privacy-policy, delivery-policy, refund-policy,
terms-and-conditions) to exist as a starting point, insert them as actual
rows in this migration with placeholder content the admin will edit — never
as a fallback array in frontend code.

STOP after this phase. Show me the migration file and wait for me to apply
it to Supabase before continuing to Phase 2.
```

---

## PHASE 2 — Backend: admin CRUD + reorder + public read

```
You are working in the Le Rasa Bakery repo: Next.js 14 (App Router) +
TypeScript + Supabase. Continuing the Policy Management System — Phase 1
(supabase/sql/19_policies.sql, the `policies` table + RLS) is already
applied.

GIT SAFETY — READ FIRST, DO NOT SKIP
- Run `git branch --show-current` and `git status -sb` before touching any
  file.
- Work ONLY on `main`. Do NOT create or switch branches on your own.
- If the current branch is not `main`, or there are unexpected uncommitted
  changes present, STOP and report exactly what you found and ask how to
  proceed.
- Do NOT commit or push anything unless explicitly asked to in that
  specific message, and even then only to `main`.

READ FIRST
- lib/admin-auth.ts + lib/admin-api.ts — admin auth pattern
  (isAuthedRequest() server-side guard; adminGet/adminSend client-side —
  every new admin UI call must use these, never a raw fetch).
- app/api/admin/products/route.ts + app/api/admin/products/[id]/route.ts +
  app/api/admin/products/reorder/route.ts — the exact CRUD + drag-reorder
  route shape to mirror (GET list, POST create, PUT update, DELETE, and a
  separate POST reorder endpoint taking `{ order: [{id, sort_order}] }`
  that bulk-updates in parallel and fails on first error).
- app/api/categories/route.ts — the public-read pattern to mirror:
  force-dynamic, no-store, wrapped in try/catch returning a safe empty
  fallback on any failure, never a raw error to the storefront.
- lib/slug.ts — slugify() helper, used here only as a create-time
  convenience default.

GROUND RULES
- Do NOT redesign the site or touch anything outside this phase's scope.
- Extend the existing architecture only — same patterns as above, no new
  conventions invented.
- After this phase: run `npm run build` and fix any type errors. Report a
  summary of files changed and STOP — do not proceed automatically.
- Stop and ask before: deleting any file, adding any npm dependency, or
  touching the Offer Management System's files.

GOAL FOR THIS PHASE
Mirror the products admin API shape exactly for policies, plus one public
read surface.

ADMIN API
- app/api/admin/policies/route.ts — GET (list, ordered by display_order) +
  POST (create). On create, if the submitted slug is blank, derive one from
  the title with slugify() as a convenience default, but let the admin
  override it. Validate slug uniqueness and format server-side (not just
  relying on the DB constraint) and return a clear 409/400 with a friendly
  message ("This URL slug is already used by another policy") rather than a
  raw Postgres error.
- app/api/admin/policies/[id]/route.ts — PUT (full update, same slug
  validation as create), DELETE.
- app/api/admin/policies/reorder/route.ts — POST, copy
  app/api/admin/products/reorder/route.ts's exact shape: body
  `{ order: [{id, display_order}] }`.
- Enable/disable is a PATCH-style partial update on the [id] route (like
  products/[id]/route.ts's PATCH) — do not build a separate endpoint just
  for the toggle.

PUBLIC READ
- app/api/policies/route.ts — GET, no auth, force-dynamic, no-store, safe
  try/catch fallback (`{ policies: [] }` on failure). Returns enabled
  policies ordered by display_order with fields: id, title,
  short_description, read_more_text, slug — NOT the full `content` (keep
  the list payload small).
- app/api/policies/[slug]/route.ts — GET, no auth, force-dynamic, no-store,
  same try/catch posture. Returns the single enabled policy matching that
  exact slug (all fields including content), or a 404 JSON body if no match
  or the policy is disabled — never leak disabled policies via a direct
  slug hit.

CONSTRAINTS
- Every admin route rejects with 401 via isAuthedRequest() exactly like the
  existing ones.
- Public routes never expose anything about disabled policies.

DONE WHEN
`npm run build` passes; a manual create → list → edit → reorder → disable →
delete cycle against these routes works (curl or a REST client is fine —
the admin UI doesn't exist until Phase 3).

STOP after this phase and wait for confirmation before Phase 3.
```

---

## PHASE 3 — Admin UI: Policy Management module

```
You are working in the Le Rasa Bakery repo: Next.js 14 (App Router) +
TypeScript + Supabase. Continuing the Policy Management System — Phases 1
(schema) and 2 (API routes: app/api/admin/policies/**, app/api/policies/**)
are already done.

GIT SAFETY — READ FIRST, DO NOT SKIP
- Run `git branch --show-current` and `git status -sb` before touching any
  file. Work ONLY on `main`, never create/switch branches on your own. If
  the branch isn't `main` or there are unexpected uncommitted changes,
  STOP and ask. Do not commit/push unless explicitly asked, and only to
  `main`.

READ FIRST
- app/admin/dashboard/products/page.tsx — the visual/styling reference
  (WINE/BERRY color constants, inputStyle/primaryBtn/ghostBtn button
  styles, adminGet/adminSend usage) to mirror.
- app/admin/dashboard/settings/page.tsx — specifically its Rotating Banners
  section, which already uses @dnd-kit (SortableContext/useSortable/
  arrayMove) for drag-to-reorder — reuse that exact pattern, don't
  introduce a different drag library.
- app/admin/dashboard/layout.tsx — sidebar NAV array (~line 24-33).
- lib/slug.ts — slugify(), used here for the auto-suggest-slug-from-title
  UX.
- This is a non-technical single-admin panel — no markdown/rich-text
  package exists in package.json yet. This phase needs a live Markdown
  preview in the editor. The minimal, safe addition is `react-markdown`
  (small, well-known, renders Markdown without executing raw HTML by
  default, no plugin needed for basic content). This is the ONE new
  dependency this whole feature needs — ask for explicit confirmation
  before running `npm install react-markdown`. Do not add a full WYSIWYG
  editor (Tiptap/Quill/etc.) — a well-labelled textarea plus this preview
  is enough; the requirement is "easy to paste existing policy text in",
  not a rich editor toolbar.

GROUND RULES
- Do NOT redesign the site. Reuse existing visual language only — no new
  styling primitives.
- After this phase: run `npm run build` and fix any type errors. Report a
  summary of files changed and STOP — do not proceed automatically.
- Stop and ask before: deleting any file, adding any dependency beyond
  react-markdown, or touching the Offer Management System's files.

GOAL FOR THIS PHASE
A first-class admin module — not a tab inside Content & Settings.

1. app/admin/dashboard/layout.tsx — add
   `{ href: "/admin/dashboard/policies", label: "Policies" }` to the NAV
   array, after "Content & Settings" and before "Analytics". Change nothing
   else in this file.

2. app/admin/dashboard/policies/page.tsx — list view, styled consistently
   with app/admin/dashboard/products/page.tsx. Include:
   - Table/list: Title, Slug, Status (Enabled/Disabled pill), Display
     Order. Drag-to-reorder using the same @dnd-kit pattern as the Rotating
     Banners section.
   - Row actions: Edit, Enable/Disable toggle, Delete (confirm dialog
     first, same pattern as any existing delete button in this repo).
   - "+ New Policy" button at the top.

3. app/admin/dashboard/policies/[id]/page.tsx (an `id === "new"` route
   handles create) — the create/edit form:
   - Title (text input).
   - Short Description (text input or small textarea — the card summary
     shown on the storefront).
   - Full Policy Content (a plain, generously-sized textarea for Markdown —
     label it clearly: "Supports Markdown: **bold**, # headings, - lists,
     [links](url). Paste your existing policy text here."). Add a live
     preview alongside it using react-markdown rendering the current
     textarea value — read-only preview, not a WYSIWYG editor.
   - Read More Button Text (text input, default "Read More").
   - URL Slug (text input, auto-suggested from Title via slugify() when
     blank/untouched, always editable). Show the resulting full URL next to
     it, e.g. "lerasa.co.uk/policies/privacy-policy".
   - Display Order (number input; also settable via drag on the list
     page — keep both in sync).
   - Enabled (toggle).
   - Save persists via the Phase 2 admin API; Delete via the same
     confirm-then-DELETE pattern used elsewhere.

CONSTRAINTS
- Client-side slug-format/uniqueness validation should mirror, not replace,
  the server-side validation from Phase 2.

STOP after this phase and wait for confirmation before Phase 4.
```

---

## PHASE 4 — Frontend: footer replacement + policy pages

```
You are working in the Le Rasa Bakery repo: Next.js 14 (App Router) +
TypeScript + Supabase. Continuing the Policy Management System — Phases 1-3
(schema, API routes, admin UI) are already done.

GIT SAFETY — READ FIRST, DO NOT SKIP
- Run `git branch --show-current` and `git status -sb` before touching any
  file. Work ONLY on `main`, never create/switch branches on your own. If
  the branch isn't `main` or there are unexpected uncommitted changes,
  STOP and ask. Do not commit/push unless explicitly asked, and only to
  `main`.

READ FIRST
- components/footer.tsx — the file with the section to replace. The
  bottom-most bar is:
  ```
  <div className="border-t border-blush-100/10">
    <div className="container flex flex-col items-center justify-between gap-3 py-6 text-xs text-blush-100/60 sm:flex-row">
      <p>© {new Date().getFullYear()} Le Rasa Bakery. All rights reserved.</p>
      <p className="flex items-center gap-1.5">Baked with <span className="text-wine">♥</span> & zero eggs</p>
    </div>
  </div>
  ```
  This is the simple bottom strip the "Le Rasa · Harrow" section refers to.
  If what's actually live differs slightly from this snapshot, it is still
  this same structural element — confirm by inspecting the rendered footer
  before editing, but don't go looking elsewhere in the component tree.
- components/conditional-footer.tsx — wraps Footer, hides it only on `/`.
  No other special-casing exists.
- lib/use-site-settings.ts — the exact client-hook shape to mirror for a
  new lib/use-policies.ts (fetch with cache:"no-store", refetch on window
  focus, safe empty-array default).
- lib/site-settings-server.ts — the server-side, no-store, try/catch
  read pattern to mirror for the new policy detail page (server component,
  not client fetch — policy pages are static-ish content and benefit from
  SSR).
- app/menu/[slug]/page.tsx and app/about/page.tsx (or app/contact/page.tsx)
  — check these for existing page-container/typography conventions and
  whether generateMetadata is already a pattern here; only use it if it is.

GROUND RULES
- Do NOT redesign the site. Preserve every other part of
  components/footer.tsx exactly as-is (Instagram carousel, brand column,
  Explore/Treats/Visit & Order columns).
- No hardcoded policy titles, slugs, or content anywhere — everything
  renders from fetched data.
- After this phase: run `npm run build` and fix any type errors. Report a
  summary of files changed and STOP — do not proceed automatically.
- Stop and ask before: deleting any file, adding any dependency, or
  touching the Offer Management System's files.

GOAL FOR THIS PHASE
Replace the static bottom bar in components/footer.tsx with responsive
Policy Cards, and add the dynamic policy detail route.

1. components/footer.tsx — replace the bottom `border-t
   border-blush-100/10` bar (above) with a new Policy Cards section in the
   same position, still inside the dark `bg-darkberry` footer. Keep the
   existing "© {year} Le Rasa Bakery" line — add the policy cards as a new
   block just above it rather than deleting attribution info.
   - Fetch enabled policies client-side (Footer is already "use client")
     via the new lib/use-policies.ts hook.
   - Render one card per policy: Title, Short Description, a
     "{read_more_text}" button/link to `/policies/{slug}`.
   - Responsive grid: reuse the same responsive grid conventions already in
     this file (e.g. the `sm:grid-cols-2 lg:grid-cols-4` pattern used a few
     lines above for the main footer columns) rather than inventing new
     breakpoints. Cards should look correct from 320px through desktop.
   - Match existing footer color palette (blush-50/blush-100/wine/dustyrose
     already used throughout this file) — no new colors.
   - If there are zero enabled policies, render nothing extra rather than
     an empty card row.

2. app/policies/[slug]/page.tsx — new server component. Fetches the single
   policy by exact slug via the Phase 2 `/api/policies/[slug]` route (or
   queries Supabase directly server-side with the anon key + RLS, whichever
   matches the existing convention more closely).
   - If not found or disabled: call Next's `notFound()`.
   - Render: Title (heading), then the Markdown `content` rendered via
     react-markdown. Wrap in the same page container/typography
     conventions used elsewhere in this app.
   - Add generateMetadata only if other dynamic pages in this app already
     do that; otherwise skip it.

CONSTRAINTS
- Scope is components/footer.tsx (one section), the new
  app/policies/[slug]/page.tsx route, and the new lib/use-policies.ts hook
  only. Do not touch navbar, hero banner, announcement bar, or anything
  else.

DONE WHEN
- The footer shows real policy cards sourced from admin-entered data on
  every page except `/`.
- Visiting /policies/{slug} for each existing slug renders that policy's
  content; an unknown slug 404s.
- Disabling a policy in the admin panel removes its card from the footer
  AND makes its direct URL 404, without a code change