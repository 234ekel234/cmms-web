/**
 * What goes where on the dashboard, how each card is configured, and how a
 * stored arrangement is reconciled with the catalogue the running build has.
 *
 * Pure on purpose — no React, no fetching. The grid reads the result, the page
 * saves it, and both stay out of the business of deciding what a layout means.
 * The API stores this list verbatim and validates only its shape
 * (`backend/helpers/dashboardLayout.js`); the catalogue is a client concept and
 * the server never sees it.
 */

/** Columns in the grid. A widget's `span` is measured in these. */
export const GRID_COLUMNS = 12;

export type OptionValue = string | number | boolean | string[];
export type WidgetOptions = Record<string, OptionValue>;

/**
 * One placed card.
 *
 * `id` and `type` are separate so the same widget can appear twice — a 7-day
 * and a 30-day trend side by side, each with its own width and settings. While
 * they were one field the only thing anyone could vary was width, and a second
 * copy of anything was a duplicate-key error.
 *
 * `options` holds only what *differs* from the widget's defaults. Two
 * consequences make that worth the small amount of merging it costs: a layout
 * stays a few hundred bytes, and a default that changes in a later build
 * reaches everybody who never overrode it.
 */
export type WidgetLayout = {
  id: string;
  type: string;
  /** Width in grid columns, 1–12. */
  span: number;
  hidden: boolean;
  options?: WidgetOptions;
};

/**
 * A setting a widget exposes in the editor.
 *
 * Four kinds, deliberately, and no free text: everything a card here needs to
 * be told is a threshold, a count, a choice from a list, or a yes/no. A string
 * field would be a label nobody reads back, or a filter expression — and a
 * filter expression is the generic query builder that was explicitly not the
 * brief.
 */
export type WidgetOptionDef =
  | { key: string; label: string; kind: "number"; min: number; max: number; default: number; suffix?: string; help?: string }
  | { key: string; label: string; kind: "select"; choices: { value: string; label: string }[]; default: string; help?: string }
  | { key: string; label: string; kind: "boolean"; default: boolean; help?: string }
  | { key: string; label: string; kind: "multi"; choices: { value: string; label: string }[]; default: string[]; help?: string };

export type WidgetMeta = {
  key: string;
  /** Shown in the card picker and announced to screen readers while editing. */
  title: string;
  defaultSpan: number;
  /**
   * The widths this widget is offered, smallest first. A KPI tile has no
   * business being twelve columns wide and a comparison chart is useless at
   * two, so the choice is per widget rather than a free drag-resize — the
   * shapes that would look broken are simply not on the menu.
   */
  spans: number[];
  /** Grouping label in the card picker, so the list is not one long run. */
  group: string;
  /** Settings this widget exposes. Absent means it has none. */
  options?: WidgetOptionDef[];
};

/** Whether a second copy of this widget would show anything different. */
export function canDuplicate(meta: WidgetMeta): boolean {
  // Derived rather than declared: a widget with no settings renders identically
  // however many times you place it, so offering to duplicate it is offering to
  // make the page longer for nothing.
  return (meta.options?.length ?? 0) > 0;
}

/** The arrangement a person sees before they have ever touched it. */
export function defaultLayout(catalogue: readonly WidgetMeta[]): WidgetLayout[] {
  return catalogue.map((w) => ({ id: w.key, type: w.key, span: w.defaultSpan, hidden: false }));
}

/** Nearest offered width to `span`, preferring the wider on a tie. */
function nearestSpan(meta: WidgetMeta, span: number): number {
  if (meta.spans.includes(span)) return span;
  return meta.spans.reduce((best, candidate) =>
    Math.abs(candidate - span) < Math.abs(best - span) ? candidate : best,
  meta.spans[0] ?? meta.defaultSpan);
}

function sameValue(a: OptionValue | undefined, b: OptionValue | undefined): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return a === b;
}

/**
 * Clean a stored settings blob against what the widget actually offers.
 *
 * Unknown keys are dropped and out-of-range values pulled back in, so a layout
 * cannot pin a setting the UI can no longer produce — the same rule `nearestSpan`
 * applies to widths. Values equal to the default are dropped too, which is what
 * keeps `options` meaning "the overrides" rather than "a frozen copy".
 */
export function normaliseOptions(meta: WidgetMeta, stored: unknown): WidgetOptions | undefined {
  const defs = meta.options;
  if (!defs?.length || !stored || typeof stored !== "object" || Array.isArray(stored)) return undefined;
  const raw = stored as Record<string, unknown>;
  const out: WidgetOptions = {};

  for (const def of defs) {
    const value = raw[def.key];
    if (value === undefined) continue;

    if (def.kind === "number") {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      const clamped = Math.min(def.max, Math.max(def.min, Math.round(n)));
      if (clamped !== def.default) out[def.key] = clamped;
    } else if (def.kind === "select") {
      if (typeof value === "string" && def.choices.some((c) => c.value === value) && value !== def.default) {
        out[def.key] = value;
      }
    } else if (def.kind === "boolean") {
      if (typeof value === "boolean" && value !== def.default) out[def.key] = value;
    } else {
      if (!Array.isArray(value)) continue;
      const allowed = def.choices.map((c) => c.value);
      // Ordered by the catalogue, not by however the array arrived: the column
      // order of a table is the catalogue's business, and honouring the stored
      // order would let a layout reshuffle headings it never meant to.
      const chosen = allowed.filter((v) => value.includes(v));
      if (!sameValue(chosen, def.default)) out[def.key] = chosen;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/** A widget's settings with defaults filled in — what `render` is handed. */
export function resolveOptions(meta: WidgetMeta, stored: WidgetOptions | undefined): WidgetOptions {
  const out: WidgetOptions = {};
  for (const def of meta.options ?? []) {
    const value = stored?.[def.key];
    out[def.key] = value === undefined ? def.default : value;
  }
  return out;
}

/**
 * Fold a stored layout onto the current catalogue.
 *
 * Four things can have changed since it was saved, and each has one right
 * answer:
 *
 * - **A widget was removed.** Its entries are dropped. Rendering nothing for
 *   them would leave a hole in the grid that cannot be closed or filled.
 * - **A widget was added.** It appears, *visible*, next to the neighbour it
 *   sits beside in the catalogue rather than at the bottom — a new KPI tile
 *   belongs in the KPI row, and a new widget nobody can find is a new widget
 *   nobody uses. Appearing hidden would be worse still: silently opted out of
 *   something they never saw.
 * - **A widget's offered widths or settings changed.** Both are pulled to what
 *   the UI can still produce, rather than pinning a shape it cannot.
 * - **The layout predates instances.** Entries carrying `key` instead of
 *   `id`/`type` are migrated here, on read. The API refuses the old shape on
 *   write, so this is the only place it is understood, and a layout is rewritten
 *   in the new shape the next time its owner saves.
 *
 * Anything that is not an array — `null` from a user who has never customised
 * anything, or a malformed payload — yields the defaults. Note that hiding is
 * `hidden: true` and never omission, precisely so that those cases stay
 * distinct: a type that is simply absent is one this layout has never heard of,
 * and it comes back visible.
 */
export function reconcile(saved: unknown, catalogue: readonly WidgetMeta[]): WidgetLayout[] {
  if (!Array.isArray(saved)) return defaultLayout(catalogue);

  const byType = new Map(catalogue.map((w) => [w.key, w]));
  const usedIds = new Set<string>();
  const layout: WidgetLayout[] = [];

  for (const entry of saved as Record<string, unknown>[]) {
    if (!entry || typeof entry !== "object") continue;
    // The legacy shape: one field that was both identity and type.
    const legacyKey = typeof entry.key === "string" ? entry.key : undefined;
    const type = typeof entry.type === "string" ? entry.type : legacyKey;
    const id = typeof entry.id === "string" ? entry.id : legacyKey;
    if (!type || !id) continue;

    const meta = byType.get(type);
    if (!meta || usedIds.has(id)) continue;
    usedIds.add(id);

    const span = typeof entry.span === "number" && Number.isFinite(entry.span) ? entry.span : meta.defaultSpan;
    const options = normaliseOptions(meta, entry.options);
    const widget: WidgetLayout = {
      id,
      type,
      span: nearestSpan(meta, Math.round(span)),
      hidden: entry.hidden === true,
    };
    if (options) widget.options = options;
    layout.push(widget);
  }

  // Every catalogue type with no instance at all, inserted after the catalogue
  // neighbour it follows. Walking the catalogue in order means a run of new
  // widgets stays in its own order too.
  catalogue.forEach((meta, index) => {
    if (layout.some((w) => w.type === meta.key)) return;
    const fresh: WidgetLayout = { id: freshId(usedIds, meta.key), type: meta.key, span: meta.defaultSpan, hidden: false };
    usedIds.add(fresh.id);
    // No surviving predecessor means everything before it in the catalogue is
    // new too — and since this walks the catalogue in order, those have already
    // been placed, so the front is the right end. Defaulting to the back
    // instead put a run of new widgets in at the bottom and in reverse.
    let at = 0;
    for (let i = index - 1; i >= 0; i -= 1) {
      const anchor = layout.map((w) => w.type).lastIndexOf(catalogue[i].key);
      if (anchor !== -1) {
        at = anchor + 1;
        break;
      }
    }
    layout.splice(at, 0, fresh);
  });

  return layout;
}

/** `type`, then `type-2`, `type-3`… — readable in a database client. */
function freshId(used: Set<string>, type: string): string {
  if (!used.has(type)) return type;
  for (let n = 2; ; n += 1) {
    const candidate = `${type}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Move a widget `delta` places among the *visible* ones. */
export function moveWidget(layout: WidgetLayout[], id: string, delta: number): WidgetLayout[] {
  // Positions are computed over visible widgets only, because that is what the
  // person is looking at: with hidden entries still in the array, one press of
  // an arrow key next to a hidden widget would appear to do nothing at all.
  const visible = layout.filter((w) => !w.hidden);
  const from = visible.findIndex((w) => w.id === id);
  if (from === -1) return layout;
  const to = from + delta;
  if (to < 0 || to >= visible.length) return layout;

  const reordered = [...visible];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);

  // Hidden widgets keep their slots in the underlying array so that unhiding
  // one puts it back where it was rather than at the end.
  let next = 0;
  return layout.map((w) => (w.hidden ? w : reordered[next++]));
}

/** Drop `id` in at the position `beforeId` currently occupies. */
export function reorderTo(layout: WidgetLayout[], id: string, beforeId: string): WidgetLayout[] {
  if (id === beforeId) return layout;
  const visible = layout.filter((w) => !w.hidden);
  const from = visible.findIndex((w) => w.id === id);
  const to = visible.findIndex((w) => w.id === beforeId);
  if (from === -1 || to === -1) return layout;
  return moveWidget(layout, id, to - from);
}

export function setSpan(layout: WidgetLayout[], id: string, span: number): WidgetLayout[] {
  return layout.map((w) => (w.id === id ? { ...w, span } : w));
}

export function setHidden(layout: WidgetLayout[], id: string, hidden: boolean): WidgetLayout[] {
  return layout.map((w) => (w.id === id ? { ...w, hidden } : w));
}

/** Set one setting, dropping it again when it matches the widget's default. */
export function setOption(
  layout: WidgetLayout[],
  id: string,
  meta: WidgetMeta,
  key: string,
  value: OptionValue,
): WidgetLayout[] {
  return layout.map((w) => {
    if (w.id !== id) return w;
    const merged = { ...(w.options ?? {}), [key]: value };
    const options = normaliseOptions(meta, merged);
    const next: WidgetLayout = { id: w.id, type: w.type, span: w.span, hidden: w.hidden };
    if (options) next.options = options;
    return next;
  });
}

/**
 * A second copy of a widget, placed immediately after the first.
 *
 * It inherits width and settings deliberately: you duplicate a card in order to
 * change one thing about it, and starting from the defaults would mean redoing
 * the work you did on the original first.
 */
export function duplicateWidget(layout: WidgetLayout[], id: string): { layout: WidgetLayout[]; id: string } {
  const at = layout.findIndex((w) => w.id === id);
  if (at === -1) return { layout, id };
  const source = layout[at];
  const copy: WidgetLayout = {
    ...source,
    id: freshId(new Set(layout.map((w) => w.id)), source.type),
    hidden: false,
    ...(source.options ? { options: { ...source.options } } : {}),
  };
  const next = [...layout];
  next.splice(at + 1, 0, copy);
  return { layout: next, id: copy.id };
}

/** Remove an instance outright. Only offered for copies — see `isOriginal`. */
export function removeWidget(layout: WidgetLayout[], id: string): WidgetLayout[] {
  return layout.filter((w) => w.id !== id);
}

/**
 * Whether this is the instance the catalogue itself put there.
 *
 * Copies can be deleted; originals can only be hidden. The distinction is not
 * ceremony: `reconcile` puts back any type with no instance at all, so deleting
 * the last copy of a widget would have it reappear on the next load looking
 * like the delete had failed. Hiding is the thing that actually sticks.
 */
export function isOriginal(widget: WidgetLayout): boolean {
  return widget.id === widget.type;
}

/**
 * How wide this widget is on a tablet and on a phone.
 *
 * Derived from the chosen desktop span rather than stored: three breakpoints of
 * saved widths is three things to keep in step, and nobody is arranging a
 * dashboard on a phone. The rule is that narrow things pair up and wide things
 * go full-width, which is what the fixed grids this replaced already did.
 */
export function responsiveSpans(span: number): { md: number; sm: number } {
  return {
    md: span <= 3 ? 4 : span <= 6 ? 6 : 12,
    sm: span <= 3 ? 6 : 12,
  };
}

/** Whether two layouts are the same — drives the Save button's enabled state. */
export function sameLayout(a: WidgetLayout[], b: WidgetLayout[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((w, i) => {
    const other = b[i];
    if (w.id !== other.id || w.type !== other.type || w.span !== other.span || w.hidden !== other.hidden) return false;
    const mine = w.options ?? {};
    const theirs = other.options ?? {};
    const keys = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
    return [...keys].every((k) => sameValue(mine[k], theirs[k]));
  });
}
