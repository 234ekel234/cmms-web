"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

/**
 * Reports as PDF: the browser's own print-to-PDF, from the report page itself.
 * No separate print route — a report is already laid out for reading, and
 * printing in place means the PDF is the period and sites on screen, never a
 * second rendering that could disagree with it. The print rules live under
 * "Reports as PDF" in globals.css.
 */

/** Paper is white whatever the screen theme is, so dark mode is lifted for the print. */
function useLightForPrint() {
  useEffect(() => {
    const root = document.documentElement;
    let saved: string | null = null;
    const before = () => {
      saved = root.getAttribute("data-theme");
      root.setAttribute("data-theme", "light");
    };
    const after = () => {
      if (saved) root.setAttribute("data-theme", saved);
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
}

export function PrintReportButton({ className = "tu-btn-secondary", disabled }: { className?: string; disabled?: boolean }) {
  useLightForPrint();
  return (
    <button type="button" className={className} onClick={() => window.print()} disabled={disabled}>
      Save as PDF
    </button>
  );
}

/**
 * The letterhead, on paper only: what the report is, which sites and period it
 * covers, and when and by whom it was produced — a PDF is forwarded long after
 * the screen it came from has moved on.
 */
export function PrintReportHeader({ title, scope, period }: { title: string; scope?: string; period?: string }) {
  const { user } = useAuth();
  // Stamped when the header mounts; a report is printed soon after it loads.
  const [generated] = useState(() =>
    new Date().toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
  );
  return (
    <div className="tu-print-head tu-print-only">
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element -- print-only, never on screen */}
        <img src="/servicemaster_logo_hq.png" alt="ServiceMaster" />
        <div className="tu-print-head-title">{title}</div>
      </div>
      <div className="tu-print-head-meta">
        {scope && <div>{scope}</div>}
        {period && <div>{period}</div>}
        <div>Generated {generated}{user ? ` by ${user.name}` : ""}</div>
      </div>
    </div>
  );
}

/** "All sites", the one site's name, or "3 sites" — an empty filter means every site. */
export function siteScope(selected: Set<string>, accounts: { id: string; name: string }[]): string {
  if (selected.size === 0) return "All sites";
  if (selected.size === 1) return accounts.find((a) => selected.has(a.id))?.name ?? "1 site";
  return `${selected.size} sites`;
}

/** "1 Oct 2026 – 27 Oct 2026" from two YYYY-MM-DD dates, read as local days. */
export function dateRangeLabel(from: string, to: string): string {
  const fmt = (ymd: string) =>
    new Date(`${ymd}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}
