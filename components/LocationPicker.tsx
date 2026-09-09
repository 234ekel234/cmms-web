"use client";

import { useState } from "react";
import api from "@/lib/api";
import {
  type AssetLocationNode,
  PATH_SEPARATOR,
  splitSelection,
} from "@/lib/assetLocations";

/**
 * Picks where an asset sits: a building, and optionally a floor or room in it.
 *
 * Two selects rather than one flat list of paths, because the two levels are
 * chosen for different reasons — the building is nearly always known, the
 * sublocation often is not — and a single list forces someone who only knows
 * "Tower B" to scroll past every floor of it to find the bare entry.
 *
 * The inline "+ New" is not a convenience. Locations have to exist before an
 * asset can point at one, so without a way to add from here, registering the
 * first asset on a site would mean leaving the half-typed form to go and build
 * a tree. It is deliberately the *only* place outside CSV import that creates a
 * location as a side effect of another task, and it shows the full path back so
 * a typo is visible before the asset is saved on top of it.
 */
export default function LocationPicker({
  accountId,
  tree,
  value,
  onChange,
  onTreeChange,
  disabled = false,
}: {
  accountId: string;
  tree: AssetLocationNode[];
  value: string | null;
  onChange: (locationId: string | null) => void;
  /** Refetches the tree; awaited before the new location is selected. */
  onTreeChange: () => Promise<void>;
  disabled?: boolean;
}) {
  const { rootId, childId } = splitSelection(tree, value);
  const root = tree.find((r) => r.id === rootId) ?? null;

  // `null` when closed; otherwise which level is being added to.
  const [adding, setAdding] = useState<"root" | "child" | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    const name = draft.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      const parentId = adding === "child" ? rootId : null;
      const res = await api.post(`/accounts/${accountId}/asset-locations`, { name, parentId });
      // The tree has to be refreshed before the id is selected, or the picker
      // would hold an id it cannot find and show nothing.
      await onTreeChange();
      onChange(res.data.id);
      setAdding(null);
      setDraft("");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "Could not add that location.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="tu-select-label">Location</label>
          <select
            className="tu-select w-full"
            disabled={disabled}
            value={rootId ?? ""}
            // Changing the building drops the old sublocation rather than
            // carrying it over: "Level 3" of Tower B is not "Level 3" of Tower C.
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">— None —</option>
            {tree.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="tu-select-label">Sublocation</label>
          <select
            className="tu-select w-full"
            disabled={disabled || !root}
            value={childId ?? ""}
            onChange={(e) => onChange(e.target.value || rootId)}
          >
            <option value="">{root ? `All of ${root.name}` : "—"}</option>
            {root?.children.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!disabled && (adding === null ? (
        <div className="flex gap-3">
          <button type="button" className="tu-btn-ghost text-xs" onClick={() => { setAdding("root"); setDraft(""); setError(""); }}>
            + New location
          </button>
          {root && (
            <button type="button" className="tu-btn-ghost text-xs" onClick={() => { setAdding("child"); setDraft(""); setError(""); }}>
              + New sublocation in {root.name}
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            className="tu-input flex-1"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } }}
            placeholder={adding === "child" ? `New sublocation in ${root?.name}` : "New location, e.g. Tower B"}
          />
          <button type="button" className="tu-btn-primary text-xs" disabled={busy || !draft.trim()} onClick={create}>
            {busy ? "Adding…" : "Add"}
          </button>
          <button type="button" className="tu-btn-secondary text-xs" onClick={() => { setAdding(null); setError(""); }}>
            Cancel
          </button>
        </div>
      ))}

      {adding === "child" && root && (
        <p className="text-[11px] text-[var(--tu-text-subtle)]">
          Will be filed as {root.name}{PATH_SEPARATOR}{draft.trim() || "…"}
        </p>
      )}
      {error && <p className="text-xs text-[var(--tu-on-danger)]">{error}</p>}
    </div>
  );
}
