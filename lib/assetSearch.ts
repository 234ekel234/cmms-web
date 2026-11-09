import { locationPath, type AssetLocationRef } from "@/lib/assetLocations";

/** The fields an asset search looks in. Optional ones are absent on some lists. */
export type SearchableAsset = {
  name: string;
  category: string;
  status?: string | null;
  assetCode?: string | null;
  serialNumber?: string | null;
  brand?: string | null;
  model?: string | null;
  ownership?: string | null;
  location: AssetLocationRef | null;
  account?: { name: string } | null;
};

/**
 * Whether an asset matches what was typed — every word, anywhere in the
 * asset's fields (in any order), so "carrier tower b" finds the Carrier unit on Tower B.
 * One rule for both asset lists (all sites, and one site's register).
 *
 * The location is searched as its whole written path, so "Tower B" finds
 * what is on its floors as well as what is filed at the building itself.
 */
export function assetMatchesSearch(asset: SearchableAsset, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [
    asset.name, asset.category, asset.status, asset.assetCode, asset.serialNumber,
    asset.brand, asset.model, asset.ownership, locationPath(asset.location), asset.account?.name,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  // A one-letter word must start a word ("tower c" is Tower C, not anything
  // with a c in it); longer ones match anywhere, so a serial's tail still finds it.
  return words.every((w) =>
    w.length > 1 ? haystack.includes(w) : new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(haystack),
  );
}
