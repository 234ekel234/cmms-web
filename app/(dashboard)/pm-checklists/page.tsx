"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type PMChecklist = {
  id: string;
  name: string;
  frequency: string;
  sections: { id: string; items: { id: string }[] }[];
};

const FREQUENCY_CONFIG: Record<string, { label: string; cls: string }> = {
  DAILY:         { label: "Daily",         cls: "bg-blue-50 text-blue-700" },
  WEEKLY:        { label: "Weekly",        cls: "bg-violet-50 text-violet-700" },
  MONTHLY:       { label: "Monthly",       cls: "bg-amber-50 text-amber-700" },
  QUARTERLY:     { label: "Quarterly",     cls: "bg-teal-50 text-teal-700" },
  SEMI_ANNUALLY: { label: "Semi-Annually", cls: "bg-pink-50 text-pink-700" },
  ANNUALLY:      { label: "Annually",      cls: "bg-green-50 text-green-700" },
};

export default function PMChecklistsPage() {
  const { user } = useAuth();
  const [checklists, setChecklists] = useState<PMChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFreq, setActiveFreq] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", frequency: "MONTHLY" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const canCreate = user?.role === "GENERAL_MANAGER" || user?.role === "MANAGER";

  useEffect(() => { fetchChecklists(); }, []);

  async function fetchChecklists() {
    setLoading(true);
    try {
      const res = await api.get("/pm-checklists");
      setChecklists(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function createChecklist() {
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    setFormError("");
    setSaving(true);
    try {
      const res = await api.post("/pm-checklists", {
        name: form.name.trim(),
        frequency: form.frequency,
        sections: [],
      });
      setChecklists((prev) => [res.data, ...prev]);
      setShowForm(false);
      setForm({ name: "", frequency: "MONTHLY" });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setFormError(e?.response?.data?.error ?? "Failed to create checklist.");
    } finally {
      setSaving(false);
    }
  }

  const presentFreqs = [...new Set(checklists.map((c) => c.frequency))];
  const visible = activeFreq ? checklists.filter((c) => c.frequency === activeFreq) : checklists;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PM Checklists</h1>
          {!loading && (
            <p className="text-sm text-gray-400 mt-0.5">
              {visible.length}{activeFreq ? ` of ${checklists.length}` : ""} template{visible.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-[#2166AC] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1a5490] transition-colors cursor-pointer"
          >
            + New Checklist
          </button>
        )}
      </div>

      {/* Frequency filter */}
      {presentFreqs.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-6">
          <button
            onClick={() => setActiveFreq(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
              activeFreq === null ? "bg-[#2166AC] text-white border-[#2166AC]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            All
          </button>
          {presentFreqs.map((freq) => {
            const cfg = FREQUENCY_CONFIG[freq] ?? { label: freq, cls: "bg-gray-100 text-gray-600" };
            const isActive = activeFreq === freq;
            return (
              <button
                key={freq}
                onClick={() => setActiveFreq(isActive ? null : freq)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
                  isActive ? cfg.cls + " border-current" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">New Checklist Template</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Name *</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Monthly Generator PM"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Frequency</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
                value={form.frequency}
                onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
              >
                {Object.entries(FREQUENCY_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>
          {formError && <p className="text-red-500 text-xs mt-3">{formError}</p>}
          <div className="flex gap-3 justify-end mt-4">
            <button onClick={() => { setShowForm(false); setFormError(""); }} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">Cancel</button>
            <button onClick={createChecklist} disabled={saving} className="px-4 py-2 text-sm text-white bg-[#2166AC] rounded-lg hover:bg-[#1a5490] disabled:opacity-50 cursor-pointer">
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-white rounded-xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-gray-400 text-sm">No checklists yet.</p>
          {canCreate && (
            <button onClick={() => setShowForm(true)} className="text-[#2166AC] text-sm font-semibold hover:underline cursor-pointer mt-2">
              Create the first template.
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((c) => {
            const freq = FREQUENCY_CONFIG[c.frequency] ?? { label: c.frequency, cls: "bg-gray-100 text-gray-600" };
            const itemCount = c.sections.reduce((sum, s) => sum + s.items.length, 0);
            return (
              <Link
                key={c.id}
                href={`/pm-checklists/${c.id}`}
                className="block bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800">{c.name}</p>
                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${freq.cls}`}>
                        {freq.label}
                      </span>
                      <span className="text-xs text-gray-400">
                        {c.sections.length} section{c.sections.length !== 1 ? "s" : ""}
                      </span>
                      <span className="text-xs text-gray-400">
                        {itemCount} item{itemCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <span className="text-gray-300 text-xl">›</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
