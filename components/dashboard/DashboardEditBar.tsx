"use client";

/**
 * The edit-mode chrome: a second navigation bar, under the app's own.
 *
 * It is sticky rather than a block at the top of the page for one reason — in
 * edit mode you scroll the grid constantly, and a picker that merely sat above
 * the cards would scroll away exactly when it is wanted, which is when you have
 * reached the bottom and want to add something. Save and Cancel moved in here
 * for the same reason: they were in the page header, so a change made at the
 * foot of a long dashboard meant scrolling back up to keep it.
 *
 * The cards on offer live behind a button rather than spread across the bar.
 * Seventeen chips wrap the bar into a block three rows deep, which is no longer
 * a bar and pushes the grid down the screen every time a card is hidden.
 */

import { useEffect, useRef, useState } from "react";
import { CATALOGUE, CATALOGUE_BY_KEY, instanceTitle } from "@/components/dashboard/widgets";
import { isOriginal, resolveOptions, type WidgetLayout } from "@/lib/dashboardLayout";

type Props = {
  layout: WidgetLayout[];
  onShow: (id: string, title: string) => void;
  onRemove: (id: string, title: string) => void;
  onReset: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
};

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export default function DashboardEditBar({
  layout, onShow, onRemove, onReset, onCancel, onSave, saving, dirty,
}: Props) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hidden = layout.filter((w) => w.hidden);

  // Grouped in catalogue order, so the panel reads the same way the dashboard
  // does rather than in whatever order cards happened to be hidden.
  const groups = CATALOGUE.reduce<{ group: string; entries: WidgetLayout[] }[]>((acc, meta) => {
    const mine = hidden.filter((w) => w.type === meta.key);
    if (mine.length === 0) return acc;
    const bucket = acc.find((g) => g.group === meta.group);
    if (bucket) bucket.entries.push(...mine);
    else acc.push({ group: meta.group, entries: [...mine] });
    return acc;
  }, []);

  return (
    <div className="tu-dash-editbar">
      <div className="tu-dash-editbar-inner">
        <span className="tu-dash-editbar-label">Editing dashboard</span>

        <div className="tu-dash-picker" ref={pickerRef}>
          <button
            type="button"
            className="tu-btn-secondary tu-btn-sm"
            aria-expanded={open}
            aria-haspopup="true"
            disabled={hidden.length === 0}
            onClick={() => setOpen((v) => !v)}
          >
            <IconPlus /> Add card
            {hidden.length > 0 && <span className="tu-dash-picker-count">{hidden.length}</span>}
          </button>

          {open && (
            <div className="tu-dash-picker-panel" role="group" aria-label="Cards not on the dashboard">
              {groups.map(({ group, entries }) => (
                <div key={group} className="tu-dash-tray-group">
                  <p className="tu-dash-tray-group-label">{group}</p>
                  <div className="tu-dash-tray-items">
                    {entries.map((w) => {
                      const meta = CATALOGUE_BY_KEY.get(w.type)!;
                      const title = instanceTitle(meta, resolveOptions(meta, w.options));
                      return (
                        <span key={w.id} className="tu-dash-chip-group">
                          <button
                            type="button"
                            className="tu-dash-chip"
                            onClick={() => {
                              onShow(w.id, title);
                              // Closing on the last one keeps the panel from
                              // sitting open over an empty list.
                              if (hidden.length === 1) setOpen(false);
                            }}
                          >
                            <span aria-hidden="true">+</span> {title}
                          </button>
                          {/* A copy can be thrown away; an original can only be
                              put back, because `reconcile` restores any type
                              with no instance at all. */}
                          {!isOriginal(w) && (
                            <button
                              type="button"
                              className="tu-dash-chip-remove"
                              aria-label={`Remove this copy of ${meta.title}`}
                              onClick={() => onRemove(w.id, title)}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {hidden.length === 0 && (
          <span className="tu-dash-editbar-note">Every card is on the dashboard.</span>
        )}

        <div className="tu-dash-editbar-actions">
          <button type="button" className="tu-btn-ghost tu-btn-sm" onClick={onReset} disabled={saving}>
            Reset to default
          </button>
          <button type="button" className="tu-btn-secondary tu-btn-sm" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="tu-btn-primary tu-btn-sm" onClick={onSave} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save layout"}
          </button>
        </div>
      </div>
    </div>
  );
}
