"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

// Global jump-to search (⌘K / Ctrl+K). Indexes navigation pages plus accounts,
// assets, and work orders (the entities with unambiguous detail routes). Data
// is loaded lazily on first open and cached for the session.

type Kind = "Page" | "Account" | "Asset" | "Work Order";
type Item = { id: string; label: string; sub?: string; kind: Kind; href: string };

const PAGES: Item[] = [
  { id: "p-dash", label: "Dashboard", kind: "Page", href: "/" },
  { id: "p-wo", label: "Work Orders", kind: "Page", href: "/work-orders" },
  { id: "p-acc", label: "Accounts", kind: "Page", href: "/accounts" },
  { id: "p-assets", label: "Assets", kind: "Page", href: "/assets" },
  { id: "p-emp", label: "Employees", kind: "Page", href: "/employees" },
  { id: "p-pm", label: "PM Checklists", kind: "Page", href: "/pm-checklists" },
  { id: "p-train", label: "Trainings", kind: "Page", href: "/trainings" },
  { id: "p-rep", label: "Reports", kind: "Page", href: "/reports" },
  { id: "p-notif", label: "Notifications", kind: "Page", href: "/notifications" },
  { id: "p-users", label: "Users", kind: "Page", href: "/users" },
  { id: "p-settings", label: "Settings", kind: "Page", href: "/settings" },
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[]>(PAGES);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);

  const loadData = useCallback(async () => {
    if (loadedRef.current) return; // load the index once per session
    loadedRef.current = true;
    setLoading(true);
    try {
      const accRes = await api.get("/accounts");
      const accounts: { id: string; name: string }[] = accRes.data;
      const accItems: Item[] = accounts.map((a) => ({
        id: `acc-${a.id}`, label: a.name, kind: "Account", href: `/accounts/${a.id}/work-orders`,
      }));
      const perAccount = await Promise.all(
        accounts.map(async (a) => {
          const [assetsR, wosR] = await Promise.all([
            api.get(`/accounts/${a.id}/assets`).catch(() => ({ data: [] })),
            api.get(`/accounts/${a.id}/work-orders`).catch(() => ({ data: [] })),
          ]);
          const assetItems: Item[] = (assetsR.data as { id: string; name: string }[]).map((as) => ({
            id: `asset-${as.id}`, label: as.name, sub: a.name, kind: "Asset",
            href: `/accounts/${a.id}/assets/${as.id}`,
          }));
          const woItems: Item[] = (wosR.data as { id: string; title: string }[]).map((wo) => ({
            id: `wo-${wo.id}`, label: wo.title, sub: a.name, kind: "Work Order",
            href: `/accounts/${a.id}/work-orders/${wo.id}`,
          }));
          return [...assetItems, ...woItems];
        })
      );
      setItems([...PAGES, ...accItems, ...perAccount.flat()]);
    } catch {
      loadedRef.current = false; // allow a retry on next open
    } finally {
      setLoading(false);
    }
  }, []);

  const openPalette = useCallback(() => {
    setQuery("");
    setActiveIdx(0);
    setOpen(true);
    loadData();
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [loadData]);

  // Open with ⌘K/Ctrl+K, an "open-command-palette" event (sidebar button), and
  // always allow Escape to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", openPalette);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", openPalette);
    };
  }, [openPalette]);

  const q = query.trim().toLowerCase();
  const results = (q
    ? items.filter(
        (it) =>
          it.label.toLowerCase().includes(q) ||
          it.sub?.toLowerCase().includes(q) ||
          it.kind.toLowerCase().includes(q)
      )
    : items
  ).slice(0, 50);

  // Clamp during render so the highlight stays valid as results shrink, instead
  // of resetting via an effect.
  const safeIdx = Math.min(activeIdx, Math.max(0, results.length - 1));

  function go(item: Item) {
    setOpen(false);
    router.push(item.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(Math.min(safeIdx + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(Math.max(safeIdx - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const it = results[safeIdx]; if (it) go(it); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
          onKeyDown={onInputKey}
          placeholder="Search accounts, assets, work orders, pages…"
          className="w-full px-4 py-3.5 text-sm border-b border-gray-100 focus:outline-none"
          aria-label="Search"
        />
        <div className="max-h-80 overflow-y-auto py-1">
          {loading && <p className="px-4 py-3 text-sm text-gray-400">Loading…</p>}
          {!loading && results.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">No matches.</p>
          )}
          {results.map((it, i) => (
            <button
              key={it.id}
              onClick={() => go(it)}
              onMouseEnter={() => setActiveIdx(i)}
              className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer ${i === safeIdx ? "bg-gray-50" : ""}`}
            >
              <span className="min-w-0">
                <span className="text-sm text-gray-800 block truncate">{it.label}</span>
                {it.sub && <span className="text-xs text-gray-400 block truncate">{it.sub}</span>}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 shrink-0">{it.kind}</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400 flex gap-3">
          <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span>
        </div>
      </div>
    </div>
  );
}
