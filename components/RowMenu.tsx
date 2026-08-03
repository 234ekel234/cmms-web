"use client";

import { useEffect, useRef, useState } from "react";

function IconDots() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="12" cy="19" r="1.9" />
    </svg>
  );
}

export type MenuAction = { label: string; onSelect: () => void; danger?: boolean };

/**
 * Per-row overflow menu.
 *
 * The panel is position:fixed and anchored to the trigger's bounding box rather
 * than absolutely positioned inside the cell. The table scrolls inside an
 * `overflow-x: auto` wrapper, and CSS computes the other axis to `auto` too —
 * an absolutely positioned panel would be clipped by it.
 */
export default function RowMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function place() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); }
    }
    // A fixed panel does not follow its anchor, so close rather than drift.
    function onMove() { setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="tu-row-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!open) place();
          setOpen((o) => !o);
        }}
      >
        <IconDots />
      </button>

      {open && pos && (
        <div
          ref={panelRef}
          role="menu"
          className="tu-menu tu-row-menu"
          style={{ position: "fixed", top: pos.top, right: pos.right, left: "auto" }}
          onClick={(e) => e.stopPropagation()}
        >
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              className={`tu-menu-item tu-menu-item-icon${a.danger ? " tu-menu-item-danger" : ""}`}
              onClick={() => { setOpen(false); a.onSelect(); }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

