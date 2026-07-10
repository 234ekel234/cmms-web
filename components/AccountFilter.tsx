"use client";

import { useEffect, useRef, useState } from "react";

export type FilterAccount = { id: string; name: string };

function IconChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginLeft: 6, marginRight: -2 }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/**
 * Multi-select account filter. An empty `selected` set means "all accounts" —
 * callers treat it as no filter rather than as "nothing selected", which keeps
 * the default view showing everything the user can reach.
 */
export default function AccountFilter({
  accounts,
  selected,
  onChange,
}: {
  accounts: FilterAccount[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  const label =
    selected.size === 0 || selected.size === accounts.length
      ? "All accounts"
      : selected.size === 1
      ? accounts.find((a) => selected.has(a.id))?.name ?? "1 account"
      : `${selected.size} accounts`;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <label className="tu-select-label" htmlFor="account-filter-trigger">Accounts</label>
      <button
        id="account-filter-trigger"
        type="button"
        className="tu-btn-secondary"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ display: "inline-flex", alignItems: "center", minWidth: 180, justifyContent: "space-between" }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <IconChevron />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label="Filter by account"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            zIndex: 30,
            minWidth: 240,
            background: "var(--tu-bg-surface)",
            border: "1px solid var(--tu-border)",
            borderRadius: 8,
            boxShadow: "var(--tu-shadow-lg)",
            padding: 8,
          }}
        >
          <button
            type="button"
            onClick={() => onChange(new Set())}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "8px",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              color: selected.size === 0 ? "var(--tu-text-brand)" : "var(--tu-text-body)",
            }}
          >
            All accounts
          </button>

          <div style={{ borderTop: "1px solid var(--tu-border)", margin: "8px 0" }} />

          <div style={{ maxHeight: 192, overflowY: "auto" }}>
            {accounts.map((a) => {
              const checked = selected.has(a.id);
              return (
                <label
                  key={a.id}
                  role="option"
                  aria-selected={checked}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 14,
                    color: "var(--tu-text-body)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(a.id)}
                    style={{ width: 16, height: 16, borderRadius: 4 }}
                  />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
