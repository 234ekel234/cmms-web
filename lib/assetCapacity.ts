/**
 * Capacity units. The list lives in the database (`GET /capacity-units`) and is
 * extended by its users from the unit dropdown — see components/CapacityUnitSelect.
 */
export type CapacityUnit = { id: string; name: string; group: string; inUse: boolean };

/** Units grouped for an <optgroup> dropdown, groups in the list's own order. */
export function groupUnits(units: CapacityUnit[]): { group: string; units: CapacityUnit[] }[] {
  const groups = new Map<string, CapacityUnit[]>();
  for (const u of units) {
    if (!groups.has(u.group)) groups.set(u.group, []);
    groups.get(u.group)!.push(u);
  }
  return [...groups].map(([group, list]) => ({ group, units: list }));
}

/** "250 kVA", or null when no capacity is on file. */
export function formatCapacity(capacity: number | null | undefined, unit: string | null | undefined): string | null {
  if (capacity == null || !unit) return null;
  return `${capacity.toLocaleString("en-PH", { maximumFractionDigits: 2 })} ${unit}`;
}

/** Mirrors MAX_FINDINGS in backend/helpers/assetCapacity.js. */
export const MAX_FINDINGS = 2000;

/** Mirrors MAX_UNIT_NAME in backend/helpers/assetCapacity.js. */
export const MAX_UNIT_NAME = 20;
