"use client";

/**
 * The dashboard.
 *
 * The page fetches, derives the model once (`lib/dashboardModel.ts`) and hands
 * it to a grid of independently placed widgets (`components/dashboard/`). It
 * deliberately owns no card markup any more: what used to be a thousand lines
 * of fixed columns is now an arrangement — a list of keys and widths, saved per
 * user — because which numbers matter depends entirely on who is looking, and
 * a supervisor covering two sites and a client watching one were being shown
 * the same eleven cards in the same order.
 *
 * The filters stay here rather than moving into widgets. Period, account and
 * trend window are *fetch* parameters: they change the payload every widget
 * reads, so a per-widget copy would be four controls for one query.
 */

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { isClosed } from "@/lib/workOrders";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import DashboardEditBar from "@/components/dashboard/DashboardEditBar";
import { catalogueFor } from "@/components/dashboard/widgets";
import { getUser } from "@/lib/auth";

// The cards this person may place — a client is not offered staff-only ones.
const myCatalogue = () => catalogueFor(getUser()?.role);
import {
  defaultLayout,
  reconcile,
  removeWidget,
  sameLayout,
  setHidden,
  type WidgetLayout,
} from "@/lib/dashboardLayout";
import {
  PERIOD_LABELS,
  buildDashboardModel,
  type DashboardData,
  type OpenOrder,
  type Period,
} from "@/lib/dashboardModel";
import { startLoad } from "@/lib/startLoad";

/**
 * Always fetch the widest window the API offers, and let each trend card slice
 * it (`sliceTrend`). Cards can be pinned to different windows, so fetching the
 * page's own window would mean either one request per card or cards quietly
 * showing less than they claim. The series is a few dozen integers.
 */
const TREND_FETCH_DAYS = 30;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtRange(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  // Signals the /dashboard aggregate doesn't carry: assignment, priority, and
  // age all live on the work-order rows themselves, and low stock is a flag on
  // parts. Both are fetched alongside and degrade silently — the page is fully
  // usable without them.
  const [openOrders, setOpenOrders] = useState<OpenOrder[] | null>(null);
  const [lowStock, setLowStock] = useState<number | null>(null);
  const [accountList, setAccountList] = useState<{ id: string; name: string }[]>([]);
  const [accountFilter, setAccountFilter] = useState<string>(""); // "" = all accounts
  const [period, setPeriod] = useState<Period>("today");
  const [trendWindow, setTrendWindow] = useState<number>(7);
  const [customFrom, setCustomFrom] = useState(todayISO);
  const [customTo, setCustomTo] = useState(todayISO);
  const [appliedRange, setAppliedRange] = useState<{ from: string; to: string } | null>(null);
  const [customError, setCustomError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // ── Layout ─────────────────────────────────────────────
  // `null` until the saved arrangement has been fetched. Rendering the defaults
  // in the meantime would flash cards somebody has hidden onto their screen and
  // then snatch them away, which reads as a bug every single load.
  const [layout, setLayout] = useState<WidgetLayout[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [layoutError, setLayoutError] = useState("");
  // One live region for the whole editor — the grid and the edit bar both
  // announce into it. See DashboardGrid's `announce` prop for why it is here.
  const [announcement, setAnnouncement] = useState("");
  // What the layout was when it was last in step with the server, so Cancel has
  // something to restore and Save knows whether it has anything to send. State
  // rather than a ref: `dirty` is read during render, and a ref read there is
  // a value React does not promise is current.
  const [saved, setSaved] = useState<WidgetLayout[] | null>(null);

  useEffect(() => {
    api.get("/accounts").then((res) => setAccountList(res.data)).catch(() => {});

    api
      .get("/dashboard/layout")
      .then((res) => {
        const stored = reconcile(res.data?.widgets, myCatalogue());
        setLayout(stored);
        setSaved(stored);
      })
      // A layout that will not load must not cost somebody their dashboard —
      // the defaults are a complete, correct arrangement, and the only thing
      // lost is their customisation until the next successful request.
      .catch(() => {
        const fallback = defaultLayout(myCatalogue());
        setLayout(fallback);
        setSaved(fallback);
      });
  }, []);

  async function fetchDashboard() {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string | number> =
        period === "custom" && appliedRange
          ? { from: appliedRange.from, to: appliedRange.to, trendDays: TREND_FETCH_DAYS }
          : { period, trendDays: TREND_FETCH_DAYS };
      if (accountFilter) params.accountId = accountFilter;
      const res = await api.get("/dashboard", { params });
      setData(res.data);

      // Deliberately not awaited with the main request: a slow or failing parts
      // call must not hold up or blank the dashboard.
      api
        .get("/work-orders")
        .then((r) => {
          const now = Date.now();
          const dayMs = 86_400_000;
          const rows: Omit<OpenOrder, "ageDays">[] = r.data;
          setOpenOrders(
            rows
              .filter(
                (w) =>
                  // Not a hand-written list: APPROVED was missing from it, so
                  // signed-off work counted as open — feeding the unassigned
                  // tile, the priority mix and the stalled list, while the
                  // "Open Work by Account" chart beside them takes its figure
                  // from the server, which excludes it. Two open counts for the
                  // same account on one screen.
                  !isClosed(w) &&
                  (!accountFilter || w.accountId === accountFilter),
              )
              .map((w) => ({
                ...w,
                ageDays: Math.floor((now - new Date(w.createdAt).getTime()) / dayMs),
              })),
          );
        })
        .catch(() => setOpenOrders([]));

      api
        .get("/parts")
        .then((r) => {
          const rows = (Array.isArray(r.data) ? r.data : r.data?.parts ?? []) as {
            isLowStock?: boolean;
            archivedAt?: string | null;
          }[];
          setLowStock(rows.filter((x) => x.isLowStock && !x.archivedAt).length);
        })
        .catch(() => setLowStock(null));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // In custom mode wait until a valid range has been applied.
    if (period === "custom" && !appliedRange) return;
    return startLoad(fetchDashboard);
    // Deliberately not `trendWindow`: the window is now sliced from the fetched
    // series rather than requested, so changing it is a re-render, not a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, appliedRange, accountFilter]);

  function handlePeriodChange(p: Period) {
    setPeriod(p);
    // Seed the range so custom fetches immediately with the default (today).
    if (p === "custom" && !appliedRange) setAppliedRange({ from: customFrom, to: customTo });
  }

  function applyCustom() {
    if (customFrom > customTo) {
      setCustomError("From date must be on or before To date.");
      return;
    }
    setCustomError("");
    setAppliedRange({ from: customFrom, to: customTo });
  }

  function startEditing() {
    setLayoutError("");
    setEditing(true);
  }

  function cancelEditing() {
    if (saved) setLayout(saved);
    setLayoutError("");
    setEditing(false);
  }

  async function saveLayout() {
    if (!layout) return;
    setSaving(true);
    setLayoutError("");
    try {
      // An arrangement identical to the defaults is stored as *no* arrangement,
      // so the row does not freeze today's catalogue into somebody's account:
      // a widget added next month appears for them, which is the whole point of
      // the reset button meaning "defaults" rather than "these eleven cards".
      if (sameLayout(layout, defaultLayout(myCatalogue()))) {
        await api.delete("/dashboard/layout");
      } else {
        await api.put("/dashboard/layout", { widgets: layout });
      }
      setSaved(layout);
      setEditing(false);
    } catch {
      // Stays in edit mode on purpose: dropping out would leave an arrangement
      // on screen that is not the one stored, and the next reload would quietly
      // undo work somebody thought they had saved.
      setLayoutError("Couldn't save your layout. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Local only — it stages the defaults, it does not store them.
   *
   * Reset writing straight through would make Cancel a lie: the arrangement is
   * already gone by the time the button they press next says it will put things
   * back. Saving the staged defaults is what reaches the server, and `saveLayout`
   * sends a DELETE for them rather than a PUT.
   */
  function resetLayout() {
    setLayoutError("");
    setLayout(defaultLayout(myCatalogue()));
    setAnnouncement("Layout reset to the defaults. Save to keep it.");
  }

  function showWidget(id: string, title: string) {
    setLayout((current) => (current ? setHidden(current, id, false) : current));
    setAnnouncement(`${title} added to the dashboard.`);
  }

  function removeWidgetInstance(id: string, title: string) {
    setLayout((current) => (current ? removeWidget(current, id) : current));
    setAnnouncement(`${title} removed.`);
  }

  const periodCaption =
    period === "custom" && appliedRange
      ? `${fmtRange(appliedRange.from)} – ${fmtRange(appliedRange.to)}`
      : PERIOD_LABELS[period].toLowerCase();

  const model = useMemo(
    () => buildDashboardModel({ data, openOrders, lowStock, loading, accountFilter, periodCaption, pageTrendDays: trendWindow }),
    [data, openOrders, lowStock, loading, accountFilter, periodCaption, trendWindow],
  );

  // The page's trend window is the default a card follows unless it pins its
  // own, so the control earns its place only while some visible card is
  // actually following it.
  const showsTrends = (layout ?? []).some(
    (w) =>
      !w.hidden &&
      (w.type === "trend-work-orders" || w.type === "trend-checklists") &&
      (w.options?.days ?? "auto") === "auto",
  );
  const dirty = layout !== null && saved !== null && !sameLayout(layout, saved);

  return (
    <div className="tu-page">
      {/* Page header */}
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Dashboard</h1>
          <p className="tu-page-sub">
            {accountFilter
              ? accountList.find((a) => a.id === accountFilter)?.name ?? "Account overview"
              : "Overview across all accounts"}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <select
            className="tu-select"
            aria-label="Filter by account"
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
          >
            <option value="">All accounts</option>
            {accountList.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          <div className="tu-filter-group" role="group" aria-label="Select time period">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePeriodChange(p)}
                className={`tu-period-pill${period === p ? " tu-active-pill" : ""}`}
                aria-pressed={period === p}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>

          {showsTrends && (
            <div className="tu-filter-group" role="group" aria-label="Select trend window">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setTrendWindow(d)}
                  className={`tu-period-pill tu-pill-sm${trendWindow === d ? " tu-active-pill" : ""}`}
                  aria-pressed={trendWindow === d}
                >
                  {d}d
                </button>
              ))}
            </div>
          )}

          {!editing && (
            <button type="button" className="tu-btn-secondary" onClick={startEditing} disabled={!layout}>
              Customise
            </button>
          )}
        </div>
      </div>

      {editing && layout && (
        <DashboardEditBar
          layout={layout}
          onShow={showWidget}
          onRemove={removeWidgetInstance}
          onReset={resetLayout}
          onCancel={cancelEditing}
          onSave={saveLayout}
          saving={saving}
          dirty={dirty}
        />
      )}

      {period === "custom" && (
        <div className="tu-custom-range" role="group" aria-label="Custom date range">
          <div>
            <label htmlFor="dash-from" className="tu-select-label">From</label>
            <input
              id="dash-from"
              type="date"
              className="tu-input"
              value={customFrom}
              max={customTo}
              onChange={(e) => { setCustomFrom(e.target.value); setCustomError(""); }}
            />
          </div>
          <span className="tu-range-sep" aria-hidden="true">–</span>
          <div>
            <label htmlFor="dash-to" className="tu-select-label">To</label>
            <input
              id="dash-to"
              type="date"
              className="tu-input"
              value={customTo}
              min={customFrom}
              max={todayISO()}
              onChange={(e) => { setCustomTo(e.target.value); setCustomError(""); }}
            />
          </div>
          <button type="button" className="tu-btn-primary" onClick={applyCustom}>Apply</button>
          {customError && <p className="tu-range-error" role="alert">{customError}</p>}
        </div>
      )}

      {error && (
        <div className="tu-error-banner" role="alert">
          Failed to load dashboard data. Please try refreshing the page.
        </div>
      )}

      {layoutError && <div className="tu-error-banner" role="alert">{layoutError}</div>}

      {layout === null ? (
        <div className="tu-dash-grid" aria-hidden="true">
          {[2, 2, 2, 2, 2, 2, 6, 6].map((span, i) => (
            <div key={i} className="tu-dash-item" style={{ ["--tu-span" as string]: String(span), ["--tu-span-md" as string]: "12", ["--tu-span-sm" as string]: "12" }}>
              <div className="tu-skeleton" style={{ height: span <= 2 ? 112 : 220, borderRadius: 8 }} />
            </div>
          ))}
        </div>
      ) : (
        <DashboardGrid
          model={model}
          layout={layout}
          editing={editing}
          onChange={setLayout}
          announce={setAnnouncement}
        />
      )}

      <div className="tu-sr-only" role="status" aria-live="polite">{announcement}</div>
    </div>
  );
}
