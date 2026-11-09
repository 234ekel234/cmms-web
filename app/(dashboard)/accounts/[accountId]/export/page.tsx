"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import api, { errorMessage } from "@/lib/api";
import { startLoad } from "@/lib/startLoad";
import { fileSlug } from "@/lib/pmExport";
import { downloadSiteWorkbook, rangeText, type Dataset, type SiteExport } from "@/lib/siteExport";

type RangePreset = "ALL" | "THIS_MONTH" | "LAST_MONTH" | "LAST_90" | "THIS_YEAR" | "CUSTOM";

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "ALL", label: "All time" },
  { key: "THIS_MONTH", label: "This month" },
  { key: "LAST_MONTH", label: "Last month" },
  { key: "LAST_90", label: "Last 90 days" },
  { key: "THIS_YEAR", label: "This year" },
  { key: "CUSTOM", label: "Custom" },
];

/** A local calendar day as YYYY-MM-DD — what the API's date params take. */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function presetRange(preset: RangePreset, now: Date): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "THIS_MONTH": return { from: ymd(new Date(y, m, 1)), to: ymd(now) };
    case "LAST_MONTH": return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case "LAST_90": return { from: ymd(new Date(y, m, now.getDate() - 89)), to: ymd(now) };
    case "THIS_YEAR": return { from: ymd(new Date(y, 0, 1)), to: ymd(now) };
    default: return { from: "", to: "" };
  }
}

/**
 * Export data — pick what to take out of this site and download it as one
 * Excel workbook, a sheet per choice. Staff only (the rows carry cost, internal
 * notes and phone numbers); the API builds every table, this page only chooses
 * and lays out (lib/siteExport.ts).
 */
export default function ExportDataPage() {
  const { accountId } = useParams<{ accountId: string }>();

  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const [siteName, setSiteName] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [preset, setPreset] = useState<RangePreset>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [cat, site] = await Promise.all([
        api.get<Dataset[]>(`/accounts/${accountId}/export/datasets`),
        api.get<{ name: string }>(`/accounts/${accountId}`),
      ]);
      setDatasets(cat.data);
      setSiteName(site.data.name);
      // Start with the record people ask for most; everything else is a tick away.
      setChosen(new Set(cat.data.filter((d) => d.key === "workOrders" || d.key === "assets").map((d) => d.key)));
    } catch (err) {
      setLoadError(errorMessage(err, "Could not load the export options."));
    }
  }, [accountId]);

  useEffect(() => startLoad(load), [load]);

  const groups = useMemo(() => {
    const out: { name: string; items: Dataset[] }[] = [];
    for (const d of datasets ?? []) {
      const g = out.find((x) => x.name === d.group);
      if (g) g.items.push(d);
      else out.push({ name: d.group, items: [d] });
    }
    return out;
  }, [datasets]);

  const anyDated = (datasets ?? []).some((d) => chosen.has(d.key) && d.dated);
  const allChosen = datasets != null && chosen.size === datasets.length;

  function toggle(key: string) {
    setDone(null);
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleGroup(items: Dataset[]) {
    setDone(null);
    const every = items.every((d) => chosen.has(d.key));
    setChosen((prev) => {
      const next = new Set(prev);
      for (const d of items) {
        if (every) next.delete(d.key);
        else next.add(d.key);
      }
      return next;
    });
  }

  function choosePreset(p: RangePreset) {
    setPreset(p);
    setDone(null);
    if (p !== "CUSTOM") {
      const r = presetRange(p, new Date());
      setFrom(r.from);
      setTo(r.to);
    }
  }

  async function runExport() {
    if (chosen.size === 0) return;
    if (from && to && from > to) { setError("The start date is after the end date."); return; }
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      // Sent in catalogue order, so the sheets come out grouped as on screen.
      const sets = (datasets ?? []).filter((d) => chosen.has(d.key)).map((d) => d.key);
      const res = await api.get<SiteExport>(`/accounts/${accountId}/export`, {
        params: { sets: sets.join(","), ...(from ? { from } : {}), ...(to ? { to } : {}) },
      });
      const span = from || to ? `${from || "start"}_to_${to || ymd(new Date())}` : "all-time";
      await downloadSiteWorkbook(res.data, siteName, `${fileSlug(siteName)}-data-${span}.xlsx`);
      const rows = res.data.tables.reduce((n, t) => n + t.rows.length, 0);
      setDone(`Downloaded ${res.data.tables.length} sheet${res.data.tables.length === 1 ? "" : "s"}, ${rows.toLocaleString()} row${rows === 1 ? "" : "s"} (${rangeText(res.data.range)}).`);
    } catch (err) {
      setError(errorMessage(err, "The export failed. Try again, or choose less data."));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <div className="px-4 py-5 sm:p-8"><div className="tu-error-banner" role="alert">{loadError}</div></div>;
  if (!datasets) return <div className="px-4 py-5 sm:p-8"><div className="tu-skeleton" style={{ height: 320, borderRadius: 12 }} /></div>;

  return (
    <div className="px-4 py-5 sm:p-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--tu-text-heading)]">Export data</h2>
          <p className="text-sm text-[var(--tu-text-subtle)] max-w-2xl">
            Choose what to take out of this site. You get one Excel workbook with a sheet for each choice. It includes
            costs, internal notes and staff phone numbers, so keep it internal.
          </p>
        </div>
        <button
          type="button"
          className="tu-btn-secondary"
          onClick={() => { setDone(null); setChosen(allChosen ? new Set() : new Set(datasets.map((d) => d.key))); }}
        >
          {allChosen ? "Clear all" : "Select all"}
        </button>
      </div>

      <div className="tu-export-groups">
        {groups.map((g) => {
          const every = g.items.every((d) => chosen.has(d.key));
          return (
            <section key={g.name} className="tu-card tu-export-group" aria-label={g.name}>
              <header className="tu-export-group-head">
                <h3 className="tu-section-title" style={{ margin: 0 }}>{g.name}</h3>
                <button type="button" className="tu-link" onClick={() => toggleGroup(g.items)}>
                  {every ? "None" : "All"}
                </button>
              </header>
              <ul className="tu-export-list">
                {g.items.map((d) => (
                  <li key={d.key}>
                    <label className="tu-export-option">
                      <input type="checkbox" checked={chosen.has(d.key)} onChange={() => toggle(d.key)} />
                      <span>
                        <span className="tu-export-option-label">{d.label}</span>
                        <span className="tu-export-option-hint">
                          {d.hint}
                          {!d.dated && " · current, not dated"}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <section className="tu-card tu-card-body flex flex-col gap-3" aria-label="Date range">
        <div>
          <h3 className="tu-section-title" style={{ margin: 0 }}>Date range</h3>
          <p className="text-sm text-[var(--tu-text-subtle)]">
            {anyDated
              ? "Applies to dated records: jobs by when they were raised, rounds by their period, attendance by day, and so on."
              : "None of your choices is dated. They export as they stand today, so the range has no effect."}
          </p>
        </div>
        <div className="tu-chip-row" role="group" aria-label="Date range">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={preset === p.key}
              className="tu-chip-toggle"
              onClick={() => choosePreset(p.key)}
              disabled={!anyDated}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "CUSTOM" && anyDated && (
          <div className="tu-form-grid" style={{ maxWidth: 420 }}>
            <div className="tu-field">
              <label className="tu-label" htmlFor="export-from">From</label>
              <input id="export-from" type="date" className="tu-input" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setDone(null); }} />
            </div>
            <div className="tu-field">
              <label className="tu-label" htmlFor="export-to">To</label>
              <input id="export-to" type="date" className="tu-input" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setDone(null); }} />
            </div>
          </div>
        )}
      </section>

      {error && <div className="tu-action-error" role="alert"><span>{error}</span></div>}
      {done && <div className="tu-badge tu-badge-success" role="status" style={{ alignSelf: "flex-start" }}>{done}</div>}

      <div className="tu-page-actions items-center">
        <button type="button" className="tu-btn-primary" disabled={busy || chosen.size === 0} onClick={runExport}>
          {busy ? "Preparing…" : `Download Excel (${chosen.size} sheet${chosen.size === 1 ? "" : "s"})`}
        </button>
        {chosen.size === 0 && <span className="text-sm text-[var(--tu-text-subtle)]">Choose at least one kind of data.</span>}
      </div>
    </div>
  );
}
