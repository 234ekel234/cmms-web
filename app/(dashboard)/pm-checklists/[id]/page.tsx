"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type PMItem = { id?: string; label: string };
type PMSection = { id?: string; title: string; answerOptions: string[]; items: PMItem[] };

const FREQUENCIES = [
  { value: "DAILY",         label: "Daily" },
  { value: "WEEKLY",        label: "Weekly" },
  { value: "MONTHLY",       label: "Monthly" },
  { value: "QUARTERLY",     label: "Quarterly" },
  { value: "SEMI_ANNUALLY", label: "Semi-Annually" },
  { value: "ANNUALLY",      label: "Annually" },
];

const DEFAULT_OPTIONS = ["OK", "NOT OK", "N/A"];

function uid() { return Math.random().toString(36).slice(2); }

export default function EditChecklistPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const id = params.id as string;

  const canEdit = user?.role === "GENERAL_MANAGER" || user?.role === "MANAGER";

  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [sections, setSections] = useState<(PMSection & { _key: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { fetchChecklist(); }, [id]);

  async function fetchChecklist() {
    try {
      const res = await api.get(`/pm-checklists/${id}`);
      const data = res.data;
      setName(data.name);
      setFrequency(data.frequency);
      setSections(
        (data.sections ?? []).map((s: PMSection) => ({
          ...s,
          _key: uid(),
          items: (s.items ?? []).map((it) => ({ ...it })),
        }))
      );
    } catch {
      setError("Failed to load checklist.");
    } finally {
      setLoading(false);
    }
  }

  // --- Section mutations ---
  const addSection = useCallback(() => {
    setSections((prev) => [
      ...prev,
      { _key: uid(), title: "", answerOptions: [...DEFAULT_OPTIONS], items: [] },
    ]);
  }, []);

  const removeSection = useCallback((key: string) => {
    setSections((prev) => prev.filter((s) => s._key !== key));
  }, []);

  const updateSection = useCallback((key: string, field: "title", value: string) => {
    setSections((prev) => prev.map((s) => s._key === key ? { ...s, [field]: value } : s));
  }, []);

  const updateAnswerOptions = useCallback((key: string, raw: string) => {
    const opts = raw.split(",").map((o) => o.trim()).filter(Boolean);
    setSections((prev) => prev.map((s) => s._key === key ? { ...s, answerOptions: opts } : s));
  }, []);

  const addItem = useCallback((sectionKey: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s._key === sectionKey ? { ...s, items: [...s.items, { label: "" }] } : s
      )
    );
  }, []);

  const removeItem = useCallback((sectionKey: string, idx: number) => {
    setSections((prev) =>
      prev.map((s) =>
        s._key === sectionKey ? { ...s, items: s.items.filter((_, i) => i !== idx) } : s
      )
    );
  }, []);

  const updateItem = useCallback((sectionKey: string, idx: number, label: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s._key === sectionKey
          ? { ...s, items: s.items.map((it, i) => (i === idx ? { ...it, label } : it)) }
          : s
      )
    );
  }, []);

  async function handleSave() {
    if (!name.trim()) { setError("Name is required."); return; }
    const emptySection = sections.find((s) => !s.title.trim());
    if (emptySection) { setError("All sections must have a title."); return; }

    setSaving(true); setError(null);
    try {
      await api.put(`/pm-checklists/${id}`, {
        name: name.trim(),
        frequency,
        sections: sections.map((s) => ({
          title: s.title.trim(),
          answerOptions: s.answerOptions.length ? s.answerOptions : DEFAULT_OPTIONS,
          items: s.items.filter((it) => it.label.trim()).map((it) => ({ label: it.label.trim() })),
        })),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/pm-checklists/${id}`);
      router.push("/pm-checklists");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "Failed to delete.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#2166AC] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto pb-32">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/pm-checklists" className="text-sm text-[#2166AC] font-semibold hover:underline shrink-0">
          ← PM Checklists
        </Link>
      </div>

      {/* Name + frequency */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Checklist Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
              placeholder="e.g. Monthly Generator PM"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]/30 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Frequency</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              disabled={!canEdit}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]/30 disabled:bg-gray-50"
            >
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4 mb-4">
        {sections.length === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-400">No sections yet.</p>
            {canEdit && (
              <button onClick={addSection} className="text-sm text-[#2166AC] font-semibold hover:underline mt-2 cursor-pointer">
                + Add the first section
              </button>
            )}
          </div>
        )}

        {sections.map((sec, si) => (
          <div key={sec._key} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Section header */}
            <div className="bg-gray-700 px-4 py-3 flex items-center gap-3">
              <span className="text-white/50 text-xs font-bold w-5 shrink-0">{si + 1}</span>
              <input
                value={sec.title}
                onChange={(e) => updateSection(sec._key, "title", e.target.value)}
                disabled={!canEdit}
                placeholder="Section title…"
                className="flex-1 bg-transparent text-white placeholder-white/40 text-sm font-bold focus:outline-none border-b border-white/20 focus:border-white/60 pb-0.5 disabled:cursor-default"
              />
              {canEdit && (
                <button
                  onClick={() => removeSection(sec._key)}
                  className="text-white/40 hover:text-red-300 text-xs font-bold transition-colors cursor-pointer shrink-0"
                >
                  Remove
                </button>
              )}
            </div>

            {/* Answer options */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <label className="block text-xs font-bold text-gray-400 mb-1.5">Answer Options (comma-separated)</label>
              <input
                value={sec.answerOptions.join(", ")}
                onChange={(e) => updateAnswerOptions(sec._key, e.target.value)}
                disabled={!canEdit}
                placeholder="OK, NOT OK, N/A"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]/30 bg-white disabled:bg-gray-50 disabled:text-gray-500"
              />
              {sec.answerOptions.length > 0 && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {sec.answerOptions.map((opt, oi) => (
                    <span key={oi} className="bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                      {opt}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Items */}
            <div className="divide-y divide-gray-50">
              {sec.items.map((item, ii) => (
                <div key={ii} className="flex items-center gap-2 px-4 py-2.5">
                  <span className="text-xs text-gray-400 w-6 shrink-0 text-right">{ii + 1}.</span>
                  <input
                    value={item.label}
                    onChange={(e) => updateItem(sec._key, ii, e.target.value)}
                    disabled={!canEdit}
                    placeholder="Checklist item…"
                    className="flex-1 text-sm border-0 focus:outline-none text-gray-800 placeholder-gray-300 disabled:bg-transparent disabled:cursor-default"
                  />
                  {canEdit && (
                    <button
                      onClick={() => removeItem(sec._key, ii)}
                      className="text-gray-300 hover:text-red-400 text-sm transition-colors cursor-pointer shrink-0"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {canEdit && (
                <button
                  onClick={() => addItem(sec._key)}
                  className="w-full text-left px-4 py-2.5 text-xs text-[#2166AC] font-semibold hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  + Add item
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {canEdit && sections.length > 0 && (
        <button
          onClick={addSection}
          className="w-full border border-dashed border-gray-300 rounded-xl py-3 text-sm text-gray-400 hover:text-[#2166AC] hover:border-[#2166AC] transition-colors cursor-pointer"
        >
          + Add Section
        </button>
      )}

      {/* Sticky footer */}
      {canEdit && (
        <div className="fixed bottom-0 left-60 right-0 bg-white border-t border-gray-200 px-8 py-4 flex items-center gap-4">
          {error && <p className="text-sm text-red-600 flex-1">{error}</p>}
          {saved && <p className="text-sm text-green-600 font-semibold flex-1">Saved successfully.</p>}
          {!error && !saved && <span className="flex-1" />}
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-sm text-red-500 hover:text-red-700 font-semibold transition-colors cursor-pointer"
          >
            Delete template
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#2166AC] text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1a5490] disabled:opacity-40 transition-colors cursor-pointer"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-gray-900 mb-2">Delete Checklist?</h3>
            <p className="text-sm text-gray-500 mb-6">
              This will permanently delete <strong>{name}</strong> and all its sections and items. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
