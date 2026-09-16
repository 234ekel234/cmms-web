"use client";

/**
 * The dashboard grid, and the editor that arranges and configures it.
 *
 * One twelve-column grid rather than the four fixed grids this replaced
 * (`tu-kpi-grid`, `tu-trend-grid`, `tu-section-grid`, `tu-content-grid`). Those
 * were what made the page unarrangeable: a widget could only ever move within
 * the band it was born in, so "put the stalled list at the top" was not a
 * change of order but a change of markup.
 *
 * Reordering is drag-and-drop *and* arrow keys on the move handle, not one or
 * the other. A dashboard is a keyboard surface — the work-order queue next door
 * is driven entirely from one — and drag-only editing would be the single
 * screen in the app a keyboard cannot operate.
 */

import { useRef, useState } from "react";
import {
  GRID_COLUMNS,
  canDuplicate,
  duplicateWidget,
  isOriginal,
  moveWidget,
  removeWidget,
  reorderTo,
  resolveOptions,
  responsiveSpans,
  setHidden,
  setOption,
  setSpan,
  type OptionValue,
  type WidgetLayout,
  type WidgetMeta,
  type WidgetOptionDef,
  type WidgetOptions,
} from "@/lib/dashboardLayout";
import { CATALOGUE_BY_KEY, instanceTitle } from "@/components/dashboard/widgets";
import type { DashboardModel } from "@/lib/dashboardModel";

type Props = {
  model: DashboardModel;
  layout: WidgetLayout[];
  editing: boolean;
  onChange: (next: WidgetLayout[]) => void;
  /**
   * Say what just happened, for screen readers.
   *
   * The live region itself lives on the page, because the edit bar announces
   * too — adding a card there scrolls nothing and may put it off-screen — and
   * two regions competing to describe one dashboard is how an announcement gets
   * dropped.
   */
  announce: (message: string) => void;
};

function IconGrip() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="5" r="1.6" /><circle cx="15" cy="5" r="1.6" />
      <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="19" r="1.6" /><circle cx="15" cy="19" r="1.6" />
    </svg>
  );
}
function IconCog() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function IconCopy() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/**
 * The settings for one placed card.
 *
 * Generic over the option definitions rather than hand-written per widget: the
 * catalogue declares what a widget can be told, and this renders it. A bespoke
 * form per widget would mean every new setting is also a new piece of UI, which
 * is exactly the tax that stops settings being added.
 */
function WidgetSettings({
  meta, values, onSet, onReset, labelledBy,
}: {
  meta: WidgetMeta;
  values: WidgetOptions;
  onSet: (key: string, value: OptionValue) => void;
  onReset: () => void;
  labelledBy: string;
}) {
  return (
    <div className="tu-dash-settings" role="group" aria-labelledby={labelledBy}>
      {(meta.options ?? []).map((def) => (
        <Field key={def.key} def={def} value={values[def.key]} onSet={onSet} idPrefix={labelledBy} />
      ))}
      <button type="button" className="tu-dash-settings-reset" onClick={onReset}>
        Reset this card&apos;s settings
      </button>
    </div>
  );
}

function Field({
  def, value, onSet, idPrefix,
}: {
  def: WidgetOptionDef;
  value: OptionValue | undefined;
  onSet: (key: string, value: OptionValue) => void;
  idPrefix: string;
}) {
  const id = `${idPrefix}-${def.key}`;
  const helpId = def.help ? `${id}-help` : undefined;

  if (def.kind === "boolean") {
    return (
      <div className="tu-dash-field">
        <label className="tu-dash-check">
          <input
            type="checkbox"
            checked={value === undefined ? def.default : value === true}
            aria-describedby={helpId}
            onChange={(e) => onSet(def.key, e.target.checked)}
          />
          {def.label}
        </label>
        {def.help && <p id={helpId} className="tu-dash-field-help">{def.help}</p>}
      </div>
    );
  }

  if (def.kind === "select") {
    return (
      <div className="tu-dash-field">
        <label htmlFor={id} className="tu-dash-field-label">{def.label}</label>
        <select
          id={id}
          className="tu-select tu-dash-field-control"
          value={typeof value === "string" ? value : def.default}
          aria-describedby={helpId}
          onChange={(e) => onSet(def.key, e.target.value)}
        >
          {def.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {def.help && <p id={helpId} className="tu-dash-field-help">{def.help}</p>}
      </div>
    );
  }

  if (def.kind === "number") {
    return (
      <div className="tu-dash-field">
        <label htmlFor={id} className="tu-dash-field-label">{def.label}</label>
        <span className="tu-dash-field-row">
          <input
            id={id}
            type="number"
            className="tu-input tu-dash-field-number"
            min={def.min}
            max={def.max}
            value={typeof value === "number" ? value : def.default}
            aria-describedby={helpId}
            // Clamped on the way in as well as in `normaliseOptions`, so typing
            // 900 into a field that stops at 90 corrects visibly rather than
            // silently rendering something the stored value does not say.
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return;
              onSet(def.key, Math.min(def.max, Math.max(def.min, Math.round(n))));
            }}
          />
          {def.suffix && <span className="tu-dash-field-suffix">{def.suffix}</span>}
        </span>
        {def.help && <p id={helpId} className="tu-dash-field-help">{def.help}</p>}
      </div>
    );
  }

  const chosen = Array.isArray(value) ? value : def.default;
  return (
    <div className="tu-dash-field">
      <p className="tu-dash-field-label" id={id}>{def.label}</p>
      <div className="tu-dash-field-multi" role="group" aria-labelledby={id} aria-describedby={helpId}>
        {def.choices.map((c) => (
          <label key={c.value} className="tu-dash-check">
            <input
              type="checkbox"
              checked={chosen.includes(c.value)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...chosen, c.value]
                  : chosen.filter((v) => v !== c.value);
                onSet(def.key, next);
              }}
            />
            {c.label}
          </label>
        ))}
      </div>
      {def.help && <p id={helpId} className="tu-dash-field-help">{def.help}</p>}
    </div>
  );
}

export default function DashboardGrid({ model, layout, editing, onChange, announce }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const visible = layout.filter((w) => !w.hidden);

  /** Keep the handle under the fingers after the element it belongs to moves. */
  function refocusHandle(id: string) {
    // React reuses the DOM node for the same key, but the element moves, and
    // browsers drop focus from a node re-parented during reconciliation.
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-handle="${id}"]`)?.focus();
    });
  }

  function move(id: string, delta: number) {
    const next = moveWidget(layout, id, delta);
    if (next === layout) return;
    onChange(next);
    const nextVisible = next.filter((w) => !w.hidden);
    const meta = CATALOGUE_BY_KEY.get(layout.find((w) => w.id === id)?.type ?? "");
    const position = nextVisible.findIndex((w) => w.id === id) + 1;
    announce(`${meta?.title ?? id} moved to position ${position} of ${nextVisible.length}.`);
    refocusHandle(id);
  }

  function resize(widget: WidgetLayout, meta: WidgetMeta, direction: 1 | -1) {
    const at = meta.spans.indexOf(widget.span);
    const nextSpan = meta.spans[Math.min(meta.spans.length - 1, Math.max(0, at + direction))];
    if (nextSpan === undefined || nextSpan === widget.span) return;
    onChange(setSpan(layout, widget.id, nextSpan));
    announce(`${meta.title} is now ${nextSpan} of ${GRID_COLUMNS} columns wide.`);
  }

  function hide(widget: WidgetLayout, meta: WidgetMeta) {
    if (settingsFor === widget.id) setSettingsFor(null);
    onChange(setHidden(layout, widget.id, true));
    announce(`${meta.title} hidden.`);
  }

  function duplicate(widget: WidgetLayout, meta: WidgetMeta) {
    const result = duplicateWidget(layout, widget.id);
    onChange(result.layout);
    // Straight into the copy's settings: the only reason to duplicate a card is
    // to change something about it, and the copy is indistinguishable until you
    // do. Opening the panel is the difference between a feature and a puzzle.
    setSettingsFor(result.id);
    announce(`${meta.title} duplicated. Adjust the copy's settings.`);
  }

  function remove(id: string, title: string) {
    if (settingsFor === id) setSettingsFor(null);
    onChange(removeWidget(layout, id));
    announce(`${title} removed.`);
  }

  function changeOption(widget: WidgetLayout, meta: WidgetMeta, key: string, value: OptionValue) {
    onChange(setOption(layout, widget.id, meta, key, value));
  }

  function resetOptions(widget: WidgetLayout, meta: WidgetMeta) {
    let next = layout;
    for (const def of meta.options ?? []) next = setOption(next, widget.id, meta, def.key, def.default);
    onChange(next);
    announce(`${meta.title} settings reset.`);
  }

  return (
    <>
      {editing && (
        <p className="tu-dash-hint" id="dash-edit-hint">
          Drag a card by its handle to reorder, or focus the handle and use the arrow keys.
          Use − and + to change a card&apos;s width, the cog to change what it shows, and × to hide it.
          Cards with settings can be duplicated, so the same card can appear twice on different settings.
        </p>
      )}

      <div
        ref={gridRef}
        className={`tu-dash-grid${editing ? " tu-dash-editing" : ""}`}
        onDragOver={(e) => {
          // Without this the drop is refused and the browser plays the
          // snap-back animation even though the reorder already happened.
          if (dragId) e.preventDefault();
        }}
      >
        {visible.map((w) => {
          const meta = CATALOGUE_BY_KEY.get(w.type);
          if (!meta) return null;
          const options = resolveOptions(meta, w.options);
          const empty = meta.isEmpty?.(model, options) ?? false;
          if (empty && !editing) return null;

          const title = instanceTitle(meta, options);
          const { md, sm } = responsiveSpans(w.span);
          const style = {
            ["--tu-span" as string]: String(w.span),
            ["--tu-span-md" as string]: String(md),
            ["--tu-span-sm" as string]: String(sm),
          };
          const at = visible.findIndex((v) => v.id === w.id);
          const spanAt = meta.spans.indexOf(w.span);
          const hasSettings = (meta.options?.length ?? 0) > 0;
          const settingsOpen = settingsFor === w.id;
          const headingId = `dash-settings-${w.id}`;

          return (
            <div
              key={w.id}
              className={`tu-dash-item${editing && dragId === w.id ? " tu-dragging" : ""}`}
              style={style}
              draggable={editing}
              onDragStart={(e) => {
                // The whole card is draggable while editing, so selecting text
                // in a settings field would otherwise pick the card up instead.
                if ((e.target as HTMLElement).closest(".tu-dash-settings")) {
                  e.preventDefault();
                  return;
                }
                setDragId(w.id);
                e.dataTransfer.effectAllowed = "move";
                // Firefox refuses to start a drag without payload.
                e.dataTransfer.setData("text/plain", w.id);
              }}
              onDragEnter={() => {
                if (dragId && dragId !== w.id) onChange(reorderTo(layout, dragId, w.id));
              }}
              onDragEnd={() => setDragId(null)}
            >
              {editing && (
                <>
                  <div className="tu-dash-tools">
                    <button
                      type="button"
                      data-handle={w.id}
                      id={headingId}
                      className="tu-dash-handle"
                      aria-label={`Move ${title}. Position ${at + 1} of ${visible.length}.`}
                      aria-describedby="dash-edit-hint"
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(w.id, -1); }
                        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(w.id, 1); }
                      }}
                    >
                      <IconGrip />
                      <span className="tu-dash-tool-title">{title}</span>
                    </button>

                    {hasSettings && (
                      <>
                        <button
                          type="button"
                          className={`tu-dash-tool${settingsOpen ? " tu-dash-tool-on" : ""}`}
                          aria-label={`Settings for ${title}`}
                          aria-expanded={settingsOpen}
                          onClick={() => setSettingsFor(settingsOpen ? null : w.id)}
                        >
                          <IconCog />
                        </button>
                        {canDuplicate(meta) && (
                          <button
                            type="button"
                            className="tu-dash-tool"
                            aria-label={`Duplicate ${title}`}
                            onClick={() => duplicate(w, meta)}
                          >
                            <IconCopy />
                          </button>
                        )}
                      </>
                    )}

                    <span className="tu-dash-size">
                      <button
                        type="button"
                        className="tu-dash-tool"
                        onClick={() => resize(w, meta, -1)}
                        disabled={spanAt <= 0}
                        aria-label={`Make ${title} narrower`}
                      >
                        −
                      </button>
                      <span className="tu-dash-size-val" aria-hidden="true">{w.span}/{GRID_COLUMNS}</span>
                      <button
                        type="button"
                        className="tu-dash-tool"
                        onClick={() => resize(w, meta, 1)}
                        disabled={spanAt >= meta.spans.length - 1}
                        aria-label={`Make ${title} wider`}
                      >
                        +
                      </button>
                    </span>

                    {/* A copy is deleted; an original is only hidden. Deleting
                        the last instance of a type would have `reconcile` put
                        it back on the next load, looking like a failed delete. */}
                    {isOriginal(w) ? (
                      <button
                        type="button"
                        className="tu-dash-tool tu-dash-hide"
                        onClick={() => hide(w, meta)}
                        aria-label={`Hide ${title}`}
                      >
                        ×
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="tu-dash-tool tu-dash-hide"
                        onClick={() => remove(w.id, title)}
                        aria-label={`Remove this copy of ${meta.title}`}
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {settingsOpen && (
                    <WidgetSettings
                      meta={meta}
                      values={options}
                      labelledBy={headingId}
                      onSet={(key, value) => changeOption(w, meta, key, value)}
                      onReset={() => resetOptions(w, meta)}
                    />
                  )}
                </>
              )}

              <div className="tu-dash-widget">
                {empty ? (
                  // Only reachable while editing — see `isEmpty` in the catalogue.
                  <div className="tu-card tu-dash-placeholder">
                    <div className="tu-card-header">
                      <h2 className="tu-card-title">{meta.title}</h2>
                    </div>
                    <div className="tu-card-body">
                      <p className="tu-chart-empty">
                        Nothing to show right now. This card appears when there is something in it.
                      </p>
                    </div>
                  </div>
                ) : (
                  meta.render(model, options)
                )}
              </div>
            </div>
          );
        })}
      </div>

      {visible.length === 0 && !editing && (
        <div className="tu-card">
          <div className="tu-card-body">
            <p className="tu-chart-empty">
              Every card is hidden. Choose <strong>Customise</strong> to put some back.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
