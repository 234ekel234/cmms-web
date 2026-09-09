/**
 * Asset locations on the client — the mirror of `backend/helpers/assetLocation.js`.
 *
 * The backend is the authority on what may exist (two levels, unique sibling
 * names, which account a location belongs to). This module only has to agree
 * with it on how a location is *written* and how the tree is walked, so that a
 * path shown in the register reads the same as one typed into a CSV.
 */

/** A location as it rides along on an asset. */
export type AssetLocationRef = {
  id: string;
  name: string;
  parentId: string | null;
  parent: { id: string; name: string } | null;
};

/** A location as it comes back from the account's location tree. */
export type AssetLocationNode = {
  id: string;
  name: string;
  parentId: string | null;
  assetCount: number;
  /** Retired kit still filed here. It blocks a delete but is not the headline figure. */
  archivedAssetCount: number;
  totalAssetCount?: number;
  children: AssetLocationNode[];
};

/** Kept identical to PATH_SEPARATOR in the backend helper. */
export const PATH_SEPARATOR = " / ";

/** "Tower B / Level 3", "Tower B", or "" when the asset is filed nowhere. */
export function locationPath(location: AssetLocationRef | null | undefined): string {
  if (!location) return "";
  return location.parent
    ? `${location.parent.name}${PATH_SEPARATOR}${location.name}`
    : location.name;
}

/**
 * Which building and sublocation a given id corresponds to.
 *
 * The picker is two selects, so it needs the pair rather than the single id the
 * asset carries. Returns nulls for an id that is not in the tree — which is not
 * an error worth throwing over: a location can be deleted while a form is open.
 */
export function splitSelection(
  tree: AssetLocationNode[],
  locationId: string | null
): { rootId: string | null; childId: string | null } {
  if (!locationId) return { rootId: null, childId: null };
  for (const root of tree) {
    if (root.id === locationId) return { rootId: root.id, childId: null };
    const child = root.children.find((c) => c.id === locationId);
    if (child) return { rootId: root.id, childId: child.id };
  }
  return { rootId: null, childId: null };
}

/**
 * Every id that counts as "inside" a location, itself included.
 *
 * This is what makes a location filter answer the question people actually ask.
 * Filtering on "Tower B" alone would return only the assets filed at the
 * building itself and silently hide everything on its floors — the exact
 * failure the free-text column had, reintroduced one level up.
 */
export function locationScopeIds(node: AssetLocationNode): string[] {
  return [node.id, ...node.children.map((c) => c.id)];
}

/** Flattens the tree to `[{ id, path, depth }]` for a select or a list. */
export function flattenTree(
  tree: AssetLocationNode[]
): { id: string; path: string; depth: number; node: AssetLocationNode }[] {
  const out: { id: string; path: string; depth: number; node: AssetLocationNode }[] = [];
  for (const root of tree) {
    out.push({ id: root.id, path: root.name, depth: 0, node: root });
    for (const child of root.children) {
      out.push({
        id: child.id,
        path: `${root.name}${PATH_SEPARATOR}${child.name}`,
        depth: 1,
        node: child,
      });
    }
  }
  return out;
}
