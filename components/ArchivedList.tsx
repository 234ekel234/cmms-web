"use client";

import { useState } from "react";

/**
 * "Show archived" under a list, with Restore on each row.
 *
 * Removing something with history archives it rather than erasing it — a
 * checklist taken off a site keeps its rounds, an employee who leaves keeps
 * their record — and this is where those come back from. Collapsed by default
 * and loaded only when opened, so the live list stays the page and the archive
 * costs nothing until someone goes looking.
 */
export default function ArchivedList<T extends { id: string }>({
  noun,
  load,
  title,
  detail,
  restore,
  canRestore,
  onRestored,
}: {
  /** Plural, lower case: "removed checklists", "archived trainings". */
  noun: string;
  load: () => Promise<T[]>;
  title: (item: T) => string;
  detail?: (item: T) => string | null;
  restore: (item: T) => Promise<void>;
  canRestore: boolean;
  /** Refetch the live list once something is back on it. */
  onRestored?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<T[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setError("");
    try {
      setItems(await load());
    } catch {
      setError(`Couldn't load ${noun}.`);
      setItems([]);
    }
  }

  async function doRestore(item: T) {
    setBusyId(item.id);
    setError("");
    try {
      await restore(item);
      setItems((prev) => (prev ?? []).filter((x) => x.id !== item.id));
      onRestored?.();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? `Couldn't restore “${title(item)}”.`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="tu-archived">
      <button type="button" className="tu-archived-toggle" onClick={toggle} aria-expanded={open}>
        {open ? `Hide ${noun}` : `Show ${noun}`}
      </button>
      {open && (
        <div className="tu-archived-body">
          {error && <p role="alert" className="tu-archived-error">{error}</p>}
          {items === null ? (
            <p className="tu-archived-empty">Loading…</p>
          ) : items.length === 0 ? (
            <p className="tu-archived-empty">No {noun}.</p>
          ) : (
            <ul role="list">
              {items.map((item) => (
                <li key={item.id} className="tu-archived-row">
                  <div className="min-w-0">
                    <p className="tu-archived-title">{title(item)}</p>
                    {detail?.(item) && <p className="tu-archived-detail">{detail(item)}</p>}
                  </div>
                  {canRestore && (
                    <button
                      type="button"
                      className="tu-btn-secondary tu-btn-sm"
                      onClick={() => doRestore(item)}
                      disabled={busyId === item.id}
                    >
                      {busyId === item.id ? "Restoring…" : "Restore"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
