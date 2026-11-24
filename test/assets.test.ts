import { describe, expect, it } from "vitest";
import { assetMatchesSearch, type SearchableAsset } from "@/lib/assetSearch";
import { flattenTree, locationPath, locationScopeIds, splitSelection, type AssetLocationNode } from "@/lib/assetLocations";

const towerB = { id: "b", name: "Tower B", parentId: null, parent: null };
const level3 = { id: "b3", name: "Level 3", parentId: "b", parent: { id: "b", name: "Tower B" } };
const chiller: SearchableAsset = {
  name: "Chiller 2", category: "HVAC", brand: "Carrier", serialNumber: "SN-88412X", status: "Operational", location: level3,
};

describe("asset search", () => {
  it("finds every word, in any order, across the fields", () => {
    expect(assetMatchesSearch(chiller, "carrier tower b")).toBe(true);
    expect(assetMatchesSearch(chiller, "hvac   CHILLER")).toBe(true);
    expect(assetMatchesSearch(chiller, "carrier tower a")).toBe(false);
  });

  it("matches a serial's tail, but a one-letter word only at the start of a word", () => {
    expect(assetMatchesSearch(chiller, "412x")).toBe(true);
    // "c" would match: the brand, Carrier, starts with one.
    expect(assetMatchesSearch(chiller, "tower d")).toBe(false);
    expect(assetMatchesSearch(chiller, "4")).toBe(false); // only mid-word in SN-88412X
  });

  it("finds what is on a building's floors by the building's name", () => {
    expect(assetMatchesSearch(chiller, "tower b")).toBe(true);
  });

  it("treats a blank search as everything, and odd characters literally", () => {
    expect(assetMatchesSearch(chiller, "   ")).toBe(true);
    expect(assetMatchesSearch(chiller, "(")).toBe(false);
  });
});

describe("locations", () => {
  const node = (id: string, name: string, parentId: string | null, children: AssetLocationNode[] = []): AssetLocationNode =>
    ({ id, name, parentId, assetCount: 0, archivedAssetCount: 0, children });
  const tree: AssetLocationNode[] = [node("b", "Tower B", null, [node("b3", "Level 3", "b")])];

  it("writes the path a person reads", () => {
    expect(locationPath(level3)).toBe("Tower B / Level 3");
    expect(locationPath(towerB)).toBe("Tower B");
    expect(locationPath(null)).toBe("");
  });

  it("counts a building's floors as inside it", () => {
    expect(locationScopeIds(tree[0])).toEqual(["b", "b3"]);
  });

  it("splits a selection into building and floor, and shrugs at an unknown id", () => {
    expect(splitSelection(tree, "b3")).toEqual({ rootId: "b", childId: "b3" });
    expect(splitSelection(tree, "b")).toEqual({ rootId: "b", childId: null });
    expect(splitSelection(tree, "gone")).toEqual({ rootId: null, childId: null });
  });

  it("flattens for a select", () => {
    expect(flattenTree(tree).map((r) => [r.path, r.depth])).toEqual([["Tower B", 0], ["Tower B / Level 3", 1]]);
  });
});
