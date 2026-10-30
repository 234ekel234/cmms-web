"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { flattenTree, type AssetLocationNode, type AssetLocationRef } from "@/lib/assetLocations";

/**
 * Where a job, a checklist round or a plan's work is done: one select over the
 * site's locations, buildings with their floors beneath.
 *
 * Unlike the asset form's LocationPicker this cannot create a location — the
 * people raising work include clients, and a typo here would mint a
 * near-duplicate building. Places are set up on the Assets page.
 */
export default function WorkLocationSelect({
  accountId,
  value,
  onChange,
  disabled = false,
  id,
  emptyLabel = "No location",
  ariaLabel,
  style,
}: {
  accountId: string;
  value: string;
  onChange: (locationId: string) => void;
  disabled?: boolean;
  id?: string;
  /** The blank option: "No location" on a form, "All locations" on a filter. */
  emptyLabel?: string;
  ariaLabel?: string;
  style?: React.CSSProperties;
}) {
  const [tree, setTree] = useState<AssetLocationNode[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get(`/accounts/${accountId}/asset-locations`)
      .then((res) => { if (!cancelled) setTree(res.data); })
      .catch(() => { if (!cancelled) setTree([]); });
    return () => { cancelled = true; };
  }, [accountId]);

  const options = tree ? flattenTree(tree) : [];
  return (
    <select
      id={id}
      className="tu-select"
      style={style ?? { width: "100%" }}
      aria-label={ariaLabel}
      value={value}
      disabled={disabled || tree === null}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{tree === null ? "Loading…" : options.length ? emptyLabel : "No locations set up"}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.depth ? `   ${o.path}` : o.path}</option>
      ))}
    </select>
  );
}

/**
 * The location a form should show after an asset is picked: the asset's own
 * place, or what was there already when the asset is filed nowhere (or none
 * was picked). Mirrors resolveLocation in the backend.
 */
export function placeForAsset(
  assets: { id: string; location?: AssetLocationRef | null }[],
  assetId: string,
  current: string,
): string {
  const asset = assets.find((a) => a.id === assetId);
  return asset?.location?.id ?? current;
}
