"use client";

import { useState } from "react";
import api from "@/lib/api";
import { type AssetLocationNode, PATH_SEPARATOR } from "@/lib/assetLocations";

/**
 * Adds, renames, moves and removes the locations on one account.
 *
 * The picker on the asset forms can create a location but never change one, and
 * that asymmetry is on purpose: creating is part of filing an asset, whereas
 * renaming "Tower B" or deleting it affects every asset already filed there.
 * Those belong somewhere you have gone deliberately, with the asset counts in
 * front of you — which is what this is.
 *
 * Deleting is refused by the API while anything is still filed under the
 * location, so the counts shown here are also the explanation for why the bin
 * is disabled. Showing the count rather than letting the request fail is the
 * difference between "you can't" and "you can't, and here is what to move".
 */
export default function LocationManagerModal({
  accountId,
  tree,
  onClose,
  onChanged,
}: {
  accountId: string;
  tree: AssetLocationNode[];
  onClose: () => void;
  /** Refetches the tree after any successful write. */
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  // `null` when closed, "" for a new building, or a parent id for a sublocation.
  const [adding, setAdding] = useState<string | null | undefined>(undefined);
  const [addDraft, setAddDraft] = useState("");

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChanged();
      setRenaming(null);
      setAdding(undefined);
      setAddDraft("");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const add = (parentId: string | null) => {
    const name = addDraft.trim();
    if (!name) return;
    run(() => api.post(`/accounts/${accountId}/asset-locations`, { name, parentId }));
  };

  const rename = (id: string) => {
    const name = renameDraft.trim();
    if (!name) return;
    run(() => api.put(`/accounts/${accountId}/asset-locations/${id}`, { name }));
  };

  const remove = (id: string) =>
    run(() => api.delete(`/accounts/${accountId}/asset-locations/${id}`));

  function row(node: AssetLocationNode, depth: number, parentName?: string) {
    const inUse = node.assetCount > 0 || node.children.length > 0;
    const isRenaming = renaming === node.id;
    return (
      <div
        key={node.id}
        className="flex items-center gap-2 py-2 border-b border-[var(--tu-border)] last:border-0"
        style={{ paddingLeft: depth * 20 }}
      >
        {isRenaming ? (
          <>
            <input
              className="tu-input flex-1"
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); rename(node.id); } }}
            />
            <button className="tu-btn-primary text-xs" disabled={busy || !renameDraft.trim()} onClick={() => rename(node.id)}>Save</button>
            <button className="tu-btn-secondary text-xs" onClick={() => setRenaming(null)}>Cancel</button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm text-[var(--tu-text-body)]">
              {depth > 0 && <span className="text-[var(--tu-text-disabled)]">{parentName}{PATH_SEPARATOR}</span>}
              {node.name}
            </span>
            <span className="tu-figure text-xs text-[var(--tu-text-subtle)]">
              {depth === 0 ? (node.totalAssetCount ?? node.assetCount) : node.assetCount}
            </span>
            <button
              className="tu-btn-ghost text-xs"
              onClick={() => { setRenameDraft(node.name); setRenaming(node.id); setError(""); }}
            >
              Rename
            </button>
            {depth === 0 && (
              <button
                className="tu-btn-ghost text-xs"
                onClick={() => { setAdding(node.id); setAddDraft(""); setError(""); }}
              >
                + Sub
              </button>
            )}
            <button
              className="tu-btn-ghost text-xs"
              disabled={busy || inUse}
              title={inUse ? "Move its assets and sublocations out first" : "Remove this location"}
              onClick={() => remove(node.id)}
            >
              Remove
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Manage locations">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-xl bg-[var(--tu-bg-surface)] rounded-xl shadow-2xl border border-[var(--tu-border)] max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-[var(--tu-border)] flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold text-[var(--tu-text-heading)]">Locations</h3>
          <button onClick={onClose} className="text-[var(--tu-text-subtle)] hover:text-[var(--tu-text-body)] cursor-pointer text-sm">✕</button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          <p className="text-xs text-[var(--tu-text-subtle)] mb-3">
            Two levels: a location, and optionally a sublocation inside it. The figure is how many
            active assets are filed there.
          </p>

          {tree.length === 0 && adding === undefined && (
            <p className="text-xs text-[var(--tu-text-disabled)] py-4">No locations yet.</p>
          )}

          {tree.map((root) => (
            <div key={root.id}>
              {row(root, 0)}
              {root.children.map((child) => row(child, 1, root.name))}
              {adding === root.id && (
                <div className="flex items-center gap-2 py-2" style={{ paddingLeft: 20 }}>
                  <input
                    className="tu-input flex-1"
                    autoFocus
                    value={addDraft}
                    onChange={(e) => setAddDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(root.id); } }}
                    placeholder={`New sublocation in ${root.name}`}
                  />
                  <button className="tu-btn-primary text-xs" disabled={busy || !addDraft.trim()} onClick={() => add(root.id)}>Add</button>
                  <button className="tu-btn-secondary text-xs" onClick={() => setAdding(undefined)}>Cancel</button>
                </div>
              )}
            </div>
          ))}

          {adding === null ? (
            <div className="flex items-center gap-2 pt-3">
              <input
                className="tu-input flex-1"
                autoFocus
                value={addDraft}
                onChange={(e) => setAddDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(null); } }}
                placeholder="New location, e.g. Tower B"
              />
              <button className="tu-btn-primary text-xs" disabled={busy || !addDraft.trim()} onClick={() => add(null)}>Add</button>
              <button className="tu-btn-secondary text-xs" onClick={() => setAdding(undefined)}>Cancel</button>
            </div>
          ) : (
            <button className="tu-btn-ghost text-xs mt-3" onClick={() => { setAdding(null); setAddDraft(""); setError(""); }}>
              + New location
            </button>
          )}

          {error && <p className="text-xs text-[var(--tu-on-danger)] mt-3">{error}</p>}
        </div>

        <div className="px-6 py-3 border-t border-[var(--tu-border)] flex justify-end shrink-0">
          <button className="tu-btn-secondary text-sm" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
