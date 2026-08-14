"use client";

/**
 * Dashboard chart primitives.
 *
 * Hand-rolled rather than pulled from a charting library, deliberately: every
 * fill here is a `--tu-*` token whose value was validated as a *set* against the
 * light and dark surfaces (see the chart-pair block in globals.css). A library
 * would take its colours from its own defaults and quietly bypass that.
 *
 * Three rules run through all of these, and they are the reason the markup is
 * shaped the way it is:
 *
 *   - Colour is never the only channel. Every chart with two or more series
 *     carries a legend, and every chart has a table twin, so a value is always
 *     reachable without distinguishing two fills.
 *   - Text wears text tokens, never the series colour. A swatch beside a label
 *     carries identity; the label itself stays in ink, because these hues are
 *     picked for contrast against the surface as *fills*, not as type.
 *   - Marks are separated by a 2px gap in the surface colour, never by a border
 *     drawn around them. A stroke adds ink that isn't data.
 */

import { useId, useState } from "react";

const fmt = (n: number) => n.toLocaleString();

export type Series = { key: string; label: string; color: string };

/**
 * Which way a tooltip should open so it stays inside the card.
 *
 * `.tu-card` clips its overflow — it has to, to keep its corner radius — so a
 * tooltip centred on the first or last mark runs off the edge and is cut in
 * half. Marks near either end open inward instead of centring.
 */
function tipAlign(index: number, count: number) {
  if (count > 2 && index <= 1) return " tu-tip--start";
  if (count > 2 && index >= count - 2) return " tu-tip--end";
  return "";
}

/* ── The table twin ────────────────────────────────────────────────────────
 * Not a fallback — the WCAG-clean equivalent of the chart, always one toggle
 * away. Tooltips enhance; they never gate a value.
 */
function ChartTable({
  head,
  rows,
}: {
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="tu-charttable-wrap">
      <table className="tu-charttable">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={i === 0 ? "" : "tu-num"}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Keyed by position, not by the first cell: two accounts may share a
              name, and a duplicate key silently drops a row from the table
              that exists to be the reliable copy of the chart. */}
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, i) =>
                i === 0 ? (
                  <th key={i} scope="row">{c}</th>
                ) : (
                  <td key={i} className="tu-num">{typeof c === "number" ? fmt(c) : c}</td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableToggle({ open, onClick, id }: { open: boolean; onClick: () => void; id: string }) {
  return (
    <button
      type="button"
      className="tu-charttable-toggle"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={id}
    >
      {open ? "Hide table" : "View as table"}
    </button>
  );
}

/* ── Legend ───────────────────────────────────────────────────────────────
 * Present whenever there are two or more series. A single-series chart gets
 * none: its title already names what is plotted, and a one-swatch box would
 * just restate it.
 */
function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="tu-chart-legend">
      {series.map((s) => (
        <li key={s.key}>
          <span className="tu-chart-swatch" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/* ══ 1. Trend columns ═════════════════════════════════════════════════════
 *
 * One series over time. Replaces a bare strip of bars that carried no axis and
 * no labels, and whose only route to a value was a `title` attribute — which
 * never appears on touch and is skipped by most screen readers.
 */
export function TrendChart({
  points,
  color,
  unit,
}: {
  points: { date: string; count: number }[];
  color: string;
  unit: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  const max = Math.max(1, ...points.map((p) => p.count));
  // Ticks land on clean numbers rather than on the data's max, so the gridlines
  // mean something a reader can carry between the two trend cards.
  const { top } = niceScale(max);
  const ticks = [0, top / 2, top];

  const dayLabel = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <>
      <div className="tu-trend">
        <div className="tu-trend-yaxis" aria-hidden="true">
          {[...ticks].reverse().map((t) => (
            <span key={t}>{fmt(t)}</span>
          ))}
        </div>

        <div className="tu-trend-plot">
          {/* Hairline, solid, one step off the surface — never dashed. */}
          {[...ticks].reverse().map((t, i) => (
            <div key={t} className="tu-trend-rule" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} aria-hidden="true" />
          ))}

          <div className="tu-trend-cols">
            {points.map((p, i) => (
              <div
                key={p.date}
                className={`tu-trend-col${active === i ? " is-active" : ""}`}
                tabIndex={0}
                role="img"
                aria-label={`${dayLabel(p.date)}: ${fmt(p.count)} ${unit}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                <div
                  className="tu-trend-bar"
                  style={{
                    height: `${(p.count / top) * 100}%`,
                    // A zero day is a real reading, not a gap: it keeps a
                    // hairline foot in the track colour so the row still reads
                    // as a continuous series rather than as missing data.
                    background: p.count > 0 ? color : "var(--tu-bg-tertiary)",
                    minHeight: p.count > 0 ? 2 : 1,
                  }}
                />
                {active === i && (
                  <div className={`tu-tip${tipAlign(i, points.length)}`} role="status">
                    <span className="tu-tip-k">{dayLabel(p.date)}</span>
                    <span className="tu-tip-v">{fmt(p.count)} {unit}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Only the ends are labelled. A date under every column is unreadable at
          30 days and goes unread at 7 — the tooltip and the table carry the rest. */}
      <div className="tu-trend-xaxis" aria-hidden="true">
        <span>{points.length ? dayLabel(points[0].date) : ""}</span>
        <span>{points.length ? dayLabel(points[points.length - 1].date) : ""}</span>
      </div>

      <TableToggle open={showTable} onClick={() => setShowTable((v) => !v)} id={tableId} />
      {showTable && (
        <div id={tableId}>
          <ChartTable head={["Date", unit[0].toUpperCase() + unit.slice(1)]} rows={points.map((p) => [dayLabel(p.date), p.count])} />
        </div>
      )}
    </>
  );
}

/**
 * A round top for the axis, always even.
 *
 * Even matters because the mid tick is `top / 2` — an odd top would print
 * "0.5" under a chart counting whole work orders, and small maxima are the
 * common case on a quiet week.
 *
 * Evenness is the *whole* requirement, though. Rounding up to an even multiple
 * of the step instead doubles the axis whenever the step is large and odd: a
 * peak of 5 took a top of 10 and drew at half height, a peak of 45 took 100 and
 * drew at 45%. Nudging an odd top up by one keeps the mid tick whole and the
 * bars near the top of the plot.
 */
function niceScale(max: number) {
  const raw = max / 2;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  let top = Math.max(2, Math.ceil(max / step) * step);
  if (top % 2) top += 1;
  return { step, top };
}

/* ══ 2. Stacked composition bar ═══════════════════════════════════════════
 *
 * Part-to-whole for the work-order pipeline. The status hues are the palette's
 * reserved set, which passes CVD separation only *with* secondary encoding —
 * hence the gaps, the legend, the in-segment labels and the table. Removing any
 * of those breaks the condition the palette was signed off under.
 */
export function StackedBar({
  segments,
  ariaLabel,
}: {
  segments: { key: string; label: string; value: number; color: string }[];
  ariaLabel: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  const total = segments.reduce((s, x) => s + x.value, 0);
  const shown = segments.filter((s) => s.value > 0);

  // A count needs roughly 9% of the bar to sit inside without cropping. Below
  // that the value moves *under* the bar on a tick rather than being dropped:
  // a segment showing no number beside four that do reads as broken, and the
  // narrow slice is often the one worth noticing — one rejected job in
  // twenty-four is the whole point of that colour being on the chart.
  const NARROW = 9;
  let cursor = 0;
  const callouts: { key: string; value: number; center: number }[] = [];
  for (const s of shown) {
    const pct = (s.value / total) * 100;
    const center = cursor + pct / 2;
    cursor += pct;
    if (pct >= NARROW) continue;
    // Two callouts closer than this would overlap and read as one number, so
    // the later one stays with the legend and the tooltip instead.
    const prev = callouts[callouts.length - 1];
    if (prev && center - prev.center < 7) continue;
    callouts.push({ key: s.key, value: s.value, center });
  }

  return (
    <>
      {/* A list, not an image. `role="img"` here made every descendant
          presentational: the per-segment labels were pruned from the
          accessibility tree while the segments stayed focusable, so tabbing
          through the bar landed on marks that announced nothing. A labelled
          list keeps the group name *and* lets each segment speak. */}
      <ul className="tu-statusbar" aria-label={ariaLabel}>
        {shown.map((s, i) => {
          const pct = (s.value / total) * 100;
          return (
            <li
              key={s.key}
              className="tu-statusbar-seg"
              style={{ width: `${pct}%`, background: s.color }}
              tabIndex={0}
              onMouseEnter={() => setActive(s.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(s.key)}
              onBlur={() => setActive(null)}
              aria-label={`${s.label}: ${fmt(s.value)}, ${Math.round(pct)} percent`}
            >
              {/* Inside only when it fits with padding on both sides; the
                  narrow ones are called out beneath the bar instead. Text is
                  never cropped by its own mark. */}
              {pct >= NARROW && <span className="tu-statusbar-val">{fmt(s.value)}</span>}
              {active === s.key && (
                <div className={`tu-tip${tipAlign(i, shown.length)}`} role="status">
                  <span className="tu-tip-k">{s.label}</span>
                  <span className="tu-tip-v">{fmt(s.value)} · {Math.round(pct)}%</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* aria-hidden: each segment announces its own label and value — which is
          true now that they are list items rather than descendants of a
          presentational role="img". Voicing these too would read the narrow
          ones out twice. */}
      {callouts.length > 0 && (
        <div className="tu-statusbar-callouts" aria-hidden="true">
          {callouts.map((c) => (
            <span
              key={c.key}
              className="tu-statusbar-callout"
              // Clamped at the ends: `.tu-card` clips its overflow, so a
              // centred callout on a slice at either edge would be cut in half.
              style={
                c.center < 4
                  ? { left: 0, transform: "none", alignItems: "flex-start" }
                  : c.center > 96
                    ? { right: 0, transform: "none", alignItems: "flex-end" }
                    : { left: `${c.center}%` }
              }
            >
              <span className="tu-statusbar-tick" />
              {fmt(c.value)}
            </span>
          ))}
        </div>
      )}

      <TableToggle open={showTable} onClick={() => setShowTable((v) => !v)} id={tableId} />
      {showTable && (
        <div id={tableId}>
          <ChartTable
            head={["Status", "Count", "Share"]}
            rows={segments.map((s) => [s.label, s.value, total ? `${Math.round((s.value / total) * 100)}%` : "—"])}
          />
        </div>
      )}
    </>
  );
}

/* ══ 3. Grouped horizontal bars ═══════════════════════════════════════════
 *
 * Two series on one shared axis — used for estimated-vs-actual man-hours and
 * for open-vs-overdue per account. Deliberately one scale: plotting two
 * measures against two y-scales invents a relationship that isn't in the data.
 */
export function GroupedBars({
  groups,
  series,
  unit,
  headLabel,
  format = fmt,
}: {
  /**
   * `id` identifies the row, `label` only names it. They are separate because
   * the label is an account name, and two sites may legitimately share one —
   * keying on it merged their rows and a bar silently vanished.
   */
  groups: { id: string; label: string; values: Record<string, number> }[];
  series: Series[];
  unit: string;
  headLabel: string;
  /**
   * Renders a value for display. Values stay in their raw unit so the bar
   * lengths are exact; only the label is converted. Rounding the values
   * themselves is what made a 570-vs-560-minute comparison draw as 10h vs 9h —
   * bars claiming a 10% gap above a headline reading −2%.
   */
  format?: (n: number) => string;
}) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  const max = Math.max(
    1,
    ...groups.flatMap((g) => series.map((s) => g.values[s.key] ?? 0))
  );

  return (
    <>
      <Legend series={series} />

      <div className="tu-gbars">
        {groups.map((g) => (
          <div key={g.id} className="tu-gbar-group">
            <span className="tu-gbar-label" title={g.label}>{g.label}</span>
            <div className="tu-gbar-rows">
              {series.map((s) => {
                const v = g.values[s.key] ?? 0;
                return (
                  <div key={s.key} className="tu-gbar-row">
                    <div className="tu-gbar-track">
                      <div
                        className="tu-gbar-fill"
                        style={{ width: `${(v / max) * 100}%`, background: s.color }}
                        role="img"
                        aria-label={`${g.label}, ${s.label}: ${format(v)} ${unit}`}
                      />
                    </div>
                    {/* Value at the tip, outside the bar, in ink — so it can
                        never be cropped by a short bar and never has to clear
                        contrast against a fill. */}
                    <span className="tu-gbar-val">{format(v)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <TableToggle open={showTable} onClick={() => setShowTable((v) => !v)} id={tableId} />
      {showTable && (
        <div id={tableId}>
          <ChartTable
            head={[headLabel, ...series.map((s) => s.label)]}
            rows={groups.map((g) => [g.label, ...series.map((s) => format(g.values[s.key] ?? 0))])}
          />
        </div>
      )}
    </>
  );
}
