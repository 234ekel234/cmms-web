"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

type PMChecklist = {
  id: string;
  name: string;
  frequency: string;
  sections: { id: string; title: string; items: { id: string }[] }[];
};

type Asset = {
  id: string;
  name: string;
  category: string;
  isArchived: boolean;
};

const FREQUENCY_CONFIG: Record<string, { label: string; cls: string }> = {
  DAILY:         { label: "Daily",         cls: "bg-[var(--tu-soft-brand)] text-[var(--tu-on-brand)]" },
  WEEKLY:        { label: "Weekly",        cls: "bg-violet-50 text-violet-700" },
  MONTHLY:       { label: "Monthly",       cls: "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]" },
  QUARTERLY:     { label: "Quarterly",     cls: "bg-teal-50 text-teal-700" },
  SEMI_ANNUALLY: { label: "Semi-Annually", cls: "bg-pink-50 text-pink-700" },
  ANNUALLY:      { label: "Annually",      cls: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" },
};

export default function AssignChecklistPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.accountId as string;

  const [checklists, setChecklists] = useState<PMChecklist[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [freqFilter, setFreqFilter] = useState("ALL");
  const [selectedChecklist, setSelectedChecklist] = useState<PMChecklist | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [assetSearch, setAssetSearch] = useState("");

  useEffect(() => {
    Promise.all([
      api.get("/pm-checklists"),
      api.get(`/accounts/${accountId}/assets`),
    ]).then(([clRes, assetRes]) => {
      setChecklists(clRes.data);
      setAssets(assetRes.data.filter((a: Asset) => !a.isArchived));
    }).catch(() => {
      setError("Failed to load data.");
    }).finally(() => setLoading(false));
  }, [accountId]);

  const frequencies = ["ALL", ...Array.from(new Set(checklists.map((c) => c.frequency)))];

  const filtered = checklists.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchFreq = freqFilter === "ALL" || c.frequency === freqFilter;
    return matchSearch && matchFreq;
  });

  const filteredAssets = assets.filter((a) =>
    `${a.name} ${a.category}`.toLowerCase().includes(assetSearch.toLowerCase())
  );

  async function handleAssign() {
    if (!selectedChecklist) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/accounts/${accountId}/pm-checklists`, {
        checklistId: selectedChecklist.id,
        assetId: selectedAssetId || undefined,
      });
      router.push(`/accounts/${accountId}/checklists`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "Failed to assign checklist.");
      setSubmitting(false);
    }
  }

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);
  const totalItems = selectedChecklist
    ? selectedChecklist.sections.reduce((sum, s) => sum + s.items.length, 0)
    : 0;

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/accounts/${accountId}/checklists`}
          className="text-[var(--tu-text-subtle)] hover:text-[var(--tu-text-body)] transition-colors text-sm"
        >
          ← Back
        </Link>
        <div>
          <h2 className="text-lg font-bold text-[var(--tu-text-heading)]">Assign Checklist</h2>
          <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
            Pick a PM template and optionally link it to an asset
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: checklist picker */}
          <div className="lg:col-span-3">
            <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm">
              <div className="p-4 border-b border-[var(--tu-border)]">
                <p className="text-xs font-bold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-3">
                  PM Template
                </p>
                <input
                  type="text"
                  placeholder="Search checklists…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]/30 mb-2"
                />
                <div className="flex flex-wrap gap-1.5">
                  {frequencies.map((f) => {
                    const cfg = FREQUENCY_CONFIG[f];
                    return (
                      <button
                        key={f}
                        onClick={() => setFreqFilter(f)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                          freqFilter === f
                            ? "bg-[var(--tu-text-brand)] text-white border-[var(--tu-text-brand)]"
                            : cfg
                            ? `${cfg.cls} border-transparent`
                            : "bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-subtle)] border-transparent"
                        }`}
                      >
                        {cfg ? cfg.label : "All"}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="divide-y divide-[var(--tu-border)] max-h-80 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="text-center text-sm text-[var(--tu-text-subtle)] py-8">No checklists found.</p>
                ) : (
                  filtered.map((c) => {
                    const cfg = FREQUENCY_CONFIG[c.frequency];
                    const items = c.sections.reduce((sum, s) => sum + s.items.length, 0);
                    const isSelected = selectedChecklist?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setSelectedChecklist(isSelected ? null : c)}
                        className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-[var(--tu-soft-brand)]/60"
                            : "hover:bg-[var(--tu-bg-secondary)]"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${isSelected ? "text-[var(--tu-text-brand)]" : "text-[var(--tu-text-heading)]"}`}>
                            {c.name}
                          </p>
                          <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
                            {c.sections.length} section{c.sections.length !== 1 ? "s" : ""} · {items} item{items !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {cfg && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.cls}`}>
                              {cfg.label}
                            </span>
                          )}
                          {isSelected && (
                            <span className="text-[var(--tu-text-brand)]">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15l-4.121-4.121a1 1 0 011.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right: asset + summary */}
          <div className="lg:col-span-2 space-y-4">
            {/* Asset picker */}
            <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-4">
              <p className="text-xs font-bold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-3">
                Link to Asset <span className="text-[var(--tu-text-disabled)] font-normal normal-case">(optional)</span>
              </p>
              <input
                type="text"
                placeholder="Search assets…"
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
                className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]/30 mb-2"
              />
              <div className="divide-y divide-[var(--tu-border)] max-h-48 overflow-y-auto rounded-lg border border-[var(--tu-border)]">
                <button
                  onClick={() => setSelectedAssetId("")}
                  className={`w-full text-left px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                    !selectedAssetId ? "bg-[var(--tu-soft-brand)]/60 text-[var(--tu-text-brand)] font-medium" : "text-[var(--tu-text-subtle)] hover:bg-[var(--tu-bg-secondary)]"
                  }`}
                >
                  No asset (general PM)
                </button>
                {filteredAssets.length === 0 && assetSearch && (
                  <p className="text-xs text-[var(--tu-text-subtle)] text-center py-4">No assets found.</p>
                )}
                {filteredAssets.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAssetId(a.id === selectedAssetId ? "" : a.id)}
                    className={`w-full text-left px-3 py-2.5 transition-colors cursor-pointer ${
                      selectedAssetId === a.id
                        ? "bg-[var(--tu-soft-brand)]/60 text-[var(--tu-text-brand)]"
                        : "hover:bg-[var(--tu-bg-secondary)] text-[var(--tu-text-body)]"
                    }`}
                  >
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-[var(--tu-text-subtle)]">{a.category}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Summary card */}
            <div className={`rounded-xl border shadow-sm p-4 transition-colors ${
              selectedChecklist ? "bg-[var(--tu-bg-surface)] border-[var(--tu-text-brand)]/20" : "bg-[var(--tu-bg-secondary)] border-[var(--tu-border)]"
            }`}>
              <p className="text-xs font-bold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-3">Summary</p>
              {selectedChecklist ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--tu-text-subtle)]">Template</span>
                    <span className="font-semibold text-[var(--tu-text-heading)] text-right max-w-[60%] truncate">{selectedChecklist.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--tu-text-subtle)]">Frequency</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${FREQUENCY_CONFIG[selectedChecklist.frequency]?.cls ?? "bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-body)]"}`}>
                      {FREQUENCY_CONFIG[selectedChecklist.frequency]?.label ?? selectedChecklist.frequency}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--tu-text-subtle)]">Sections</span>
                    <span className="text-[var(--tu-text-heading)]">{selectedChecklist.sections.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--tu-text-subtle)]">Items</span>
                    <span className="text-[var(--tu-text-heading)]">{totalItems}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--tu-text-subtle)]">Asset</span>
                    <span className="text-[var(--tu-text-heading)]">{selectedAsset ? selectedAsset.name : "General"}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--tu-text-subtle)]">Select a template to preview.</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-[var(--tu-on-danger)] bg-[var(--tu-soft-danger)] rounded-lg px-3 py-2">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Link
                href={`/accounts/${accountId}/checklists`}
                className="flex-1 text-center border border-[var(--tu-border)] text-[var(--tu-text-body)] px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[var(--tu-bg-secondary)] transition-colors"
              >
                Cancel
              </Link>
              <button
                onClick={handleAssign}
                disabled={!selectedChecklist || submitting}
                className="flex-1 bg-[var(--tu-text-brand)] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {submitting ? "Assigning…" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
