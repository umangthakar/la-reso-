// ============================================================
// Le Rasa Bakery — category hierarchy rules (pure, client + server safe)
// ------------------------------------------------------------
// No imports, no side effects — same shape as lib/pricing.ts, so the admin
// API route and any UI can share ONE set of rules rather than each having
// its own idea of what a valid tree is.
//
// Categories in this project are a flat, ordered jsonb string[] on
// site_settings, and products reference them BY NAME (products.category is
// free text — there are no category ids). A parent is therefore also recorded
// by name, in site_settings.category_parents:
//
//   { "<child name>": "<parent name>" }
//
// A category with no entry is TOP LEVEL. Nothing here touches products: the
// hierarchy is metadata about the names, so a category that gains or loses a
// parent keeps every product already filed under it.
// ============================================================

/** child name → parent name. Absent key = top-level category. */
export type ParentMap = Record<string, string>;

/** Case-insensitive lookup of a name in the canonical list, or null. */
export function canonical(list: string[], name: string): string | null {
  const key = String(name ?? "").trim().toLowerCase();
  if (!key) return null;
  return list.find((c) => c.toLowerCase() === key) ?? null;
}

/**
 * True when making `parent` the parent of `child` would close a loop — i.e.
 * `child` already sits somewhere above `parent`. This is what stops
 * A → B → C → A. Walks up from `parent`; the visited set also keeps
 * already-broken data from spinning forever.
 */
export function createsCycle(
  parents: ParentMap,
  child: string,
  parent: string,
): boolean {
  const seen = new Set<string>();
  let cursor: string | undefined = parent;
  while (cursor) {
    if (cursor === child) return true;
    if (seen.has(cursor)) return false; // pre-existing loop, not the one we'd add
    seen.add(cursor);
    cursor = parents[cursor];
  }
  return false;
}

/**
 * Drop anything that can't describe a valid tree: unknown child, unknown
 * parent, self-parenting, or a link that closes a cycle. Applied on every
 * read, so a hand-edited jsonb value can never break the admin page or hide a
 * category. Entries are processed in insertion order, so the first link of a
 * cycle survives and only the one closing it is dropped.
 */
export function sanitiseParents(list: string[], raw: unknown): ParentMap {
  const clean: ParentMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return clean;

  for (const [child, parent] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof parent !== "string") continue;
    const c = canonical(list, child);
    const p = canonical(list, parent);
    if (!c || !p || c === p) continue;
    if (createsCycle(clean, c, p)) continue;
    clean[c] = p;
  }
  return clean;
}

/** A category flattened for display: its name and how deep it sits. */
export type TreeRow = { name: string; depth: number };

/**
 * Flatten to tree order: top-level categories in their stored order, each
 * immediately followed by its descendants (also in stored order). Anything
 * left over — only reachable from data sanitiseParents couldn't fully repair —
 * is appended at depth 0, so a category can never vanish from the admin list.
 */
export function inTreeOrder(list: string[], parents: ParentMap): TreeRow[] {
  const childrenOf = new Map<string, string[]>();
  for (const name of list) {
    const parent = parents[name];
    if (!parent) continue;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), name]);
  }

  const out: TreeRow[] = [];
  const emitted = new Set<string>();
  const walk = (name: string, depth: number) => {
    if (emitted.has(name)) return;
    emitted.add(name);
    out.push({ name, depth });
    for (const child of childrenOf.get(name) ?? []) walk(child, depth + 1);
  };

  for (const name of list) if (!parents[name]) walk(name, 0);
  for (const name of list) if (!emitted.has(name)) walk(name, 0);
  return out;
}

/**
 * Rewrite the map after a category is renamed. The category keeps its own
 * parent and keeps its children — a rename changes the label only, never the
 * shape of the tree (and never a product's category, which the API updates
 * separately).
 */
export function renameInParents(
  parents: ParentMap,
  oldName: string,
  newName: string,
): ParentMap {
  const out: ParentMap = {};
  for (const [child, parent] of Object.entries(parents)) {
    out[child === oldName ? newName : child] = parent === oldName ? newName : parent;
  }
  return out;
}

/** The direct children of a category, in the given list's order. */
export function childrenOf(
  list: string[],
  parents: ParentMap,
  name: string,
): string[] {
  return list.filter((c) => parents[c] === name);
}

/** The top-level categories (those with no parent), in the list's order. */
export function topLevelOf(list: string[], parents: ParentMap): string[] {
  return list.filter((c) => !parents[c]);
}

/**
 * Every category beneath `name`, at any depth, in the list's order. Used to
 * scope a filter: selecting a parent should show its own products AND those
 * of everything under it, without the customer clicking each child.
 * A leaf returns []. Guarded against a malformed tree looping.
 */
export function descendantsOf(
  list: string[],
  parents: ParentMap,
  name: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>([name]);
  let frontier = [name];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const parent of frontier) {
      for (const child of childrenOf(list, parents, parent)) {
        if (seen.has(child)) continue;
        seen.add(child);
        out.push(child);
        next.push(child);
      }
    }
    frontier = next;
  }
  return out;
}

/**
 * The top-level ancestor of a category — itself when it has no parent. Lets a
 * selected subcategory keep its parent's branch open without a second piece of
 * state. Guarded against a malformed tree looping.
 */
export function rootOf(parents: ParentMap, name: string): string {
  const seen = new Set<string>();
  let cursor = name;
  while (parents[cursor]) {
    if (seen.has(cursor)) break; // already-broken data — stop rather than spin
    seen.add(cursor);
    cursor = parents[cursor];
  }
  return cursor;
}
