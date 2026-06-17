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
  DAILY:         { label: "Daily",         cls: "bg-blue-50 text-blue-700" },
  WEEKLY:        { label: "Weekly",        cls: "bg-violet-50 text-violet-700" },
  MONTHLY:       { label: "Monthly",       cls: "bg-amber-50 text-amber-700" },
  QUARTERLY:     { label: "Quarterly",     cls: "bg-teal-50 text-teal-700" },
  SEMI_ANNUALLY: { label: "Semi-Annually", cls: "bg-pink-50 text-pink-700" },
  ANNUALLY:      { label: "Annually",      cls: "bg-green-50 text-green-700" },
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
          className="text-gray-400 hover:text-gray-600 transition-colors text-sm"
        >
          ← Back
        </Link>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Assign Checklist</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Pick a PM template and optionally link it to an asset
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-white rounded-xl border border-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: checklist picker */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="p-4 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
                  PM Template
                </p>
                <input
                  type="text"
                  placeholder="Search checklists…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]/30 mb-2"
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
                            ? "bg-[#2166AC] text-white border-[#2166AC]"
                            : cfg
                            ? `${cfg.cls} border-transparent`
                            : "bg-gray-100 text-gray-500 border-transparent"
                        }`}
                      >
                        {cfg ? cfg.label : "All"}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-8">No checklists found.</p>
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
                            ? "bg-blue-50/60"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${isSelected ? "text-[#2166AC]" : "text-gray-800"}`}>
                            {c.name}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
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
                            <span className="text-[#2166AC]">
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
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
                Link to Asset <span className="text-gray-300 font-normal normal-case">(optional)</span>
              </p>
              <input
                type="text"
                placeholder="Search assets…"
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]/30 mb-2"
              />
              <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto rounded-lg border border-gray-100">
                <button
                  onClick={() => setSelectedAssetId("")}
                  className={`w-full text-left px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                    !selectedAssetId ? "bg-blue-50/60 text-[#2166AC] font-medium" : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  No asset (general PM)
                </button>
                {filteredAssets.length === 0 && assetSearch && (
                  <p className="text-xs text-gray-400 text-center py-4">No assets found.</p>
                )}
                {filteredAssets.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAssetId(a.id === selectedAssetId ? "" : a.id)}
                    className={`w-full text-left px-3 py-2.5 transition-colors cursor-pointer ${
                      selectedAssetId === a.id
                        ? "bg-blue-50/60 text-[#2166AC]"
                        : "hover:bg-gray-50 text-gray-700"
                    }`}
                  >
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-gray-400">{a.category}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Summary card */}
            <div className={`rounded-xl border shadow-sm p-4 transition-colors ${
              selectedChecklist ? "bg-white border-[#2166AC]/20" : "bg-gray-50 border-gray-100"
            }`}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Summary</p>
              {selectedChecklist ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Template</span>
                    <span className="font-semibold text-gray-800 text-right max-w-[60%] truncate">{selectedChecklist.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Frequency</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${FREQUENCY_CONFIG[selectedChecklist.frequency]?.cls ?? "bg-gray-100 text-gray-600"}`}>
                      {FREQUENCY_CONFIG[selectedChecklist.frequency]?.label ?? selectedChecklist.frequency}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Sections</span>
                    <span className="text-gray-800">{selectedChecklist.sections.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Items</span>
                    <span className="text-gray-800">{totalItems}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Asset</span>
                    <span className="text-gray-800">{selectedAsset ? selectedAsset.name : "General"}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Select a template to preview.</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Link
                href={`/accounts/${accountId}/checklists`}
                className="flex-1 text-center border border-gray-200 text-gray-600 px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </Link>
              <button
                onClick={handleAssign}
                disabled={!selectedChecklist || submitting}
                className="flex-1 bg-[#2166AC] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1a5490] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
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
