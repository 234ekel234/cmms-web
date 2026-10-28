"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Breadcrumbs from "@/components/Breadcrumbs";
import EmptyState from "@/components/EmptyState";
import { useConfirm } from "@/components/ConfirmDialog";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { startLoad } from "@/lib/startLoad";

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
  // Any edit since load or the last save. Leaving asks first while it holds.
  const [dirty, setDirty] = useState(false);
  // Set when this template is archived — reachable by URL, not from the library.
  const [archivedAt, setArchivedAt] = useState<string | null>(null);
  const confirm = useConfirm();
  useUnsavedChanges(dirty, "Your changes to this template since the last save will be lost.");

  const fetchChecklist = useCallback(async () => {
    try {
      const res = await api.get(`/pm-checklists/${id}`);
      const data = res.data;
      setName(data.name);
      setArchivedAt(data.archivedAt ?? null);
      setFrequency(data.frequency);
      setSections(
        (data.sections ?? []).map((s: PMSection) => ({
          ...s,
          _key: uid(),
          items: (s.items ?? []).map((it) => ({ ...it })),
        }))
      );
      setDirty(false);
    } catch {
      setError("Failed to load checklist.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => startLoad(fetchChecklist), [fetchChecklist]);

  // --- Section mutations ---
  const addSection = useCallback(() => {
    setDirty(true);
    setSections((prev) => [
      ...prev,
      { _key: uid(), title: "", answerOptions: [...DEFAULT_OPTIONS], items: [] },
    ]);
  }, []);

  // Removing asks first once there is something in it to lose — a titled
  // section or a typed question. An empty row added by mistake just goes.
  async function removeSection(key: string) {
    const sec = sections.find((s) => s._key === key);
    if (!sec) return;
    const filled = sec.items.filter((it) => it.label.trim()).length;
    if ((sec.title.trim() || filled > 0) && !(await confirm({
      title: "Remove this section?",
      message: `“${sec.title.trim() || "Untitled section"}”${filled ? ` and its ${filled} question${filled === 1 ? "" : "s"}` : ""} will be removed when you save. A question with answers on file can't be removed — the save will say so.`,
      confirmLabel: "Remove",
    }))) return;
    setDirty(true);
    setSections((prev) => prev.filter((s) => s._key !== key));
  }

  const updateSection = useCallback((key: string, field: "title", value: string) => {
    setDirty(true);
    setSections((prev) => prev.map((s) => s._key === key ? { ...s, [field]: value } : s));
  }, []);

  const updateAnswerOptions = useCallback((key: string, raw: string) => {
    setDirty(true);
    const opts = raw.split(",").map((o) => o.trim()).filter(Boolean);
    setSections((prev) => prev.map((s) => s._key === key ? { ...s, answerOptions: opts } : s));
  }, []);

  const addItem = useCallback((sectionKey: string) => {
    setDirty(true);
    setSections((prev) =>
      prev.map((s) =>
        s._key === sectionKey ? { ...s, items: [...s.items, { label: "" }] } : s
      )
    );
  }, []);

  async function removeItem(sectionKey: string, idx: number) {
    const label = sections.find((s) => s._key === sectionKey)?.items[idx]?.label.trim();
    if (label && !(await confirm({
      title: "Remove this question?",
      message: `“${label}” will be removed when you save. If it has answers on file, the save will refuse.`,
      confirmLabel: "Remove",
    }))) return;
    setDirty(true);
    setSections((prev) =>
      prev.map((s) =>
        s._key === sectionKey ? { ...s, items: s.items.filter((_, i) => i !== idx) } : s
      )
    );
  }

  const updateItem = useCallback((sectionKey: string, idx: number, label: string) => {
    setDirty(true);
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

    setError(null);
    // A template in use changes the form at every site using it, and rewording
    // a question rewords it on rounds already filed (answers point at the
    // question, not a copy). Say so before it happens.
    try {
      const { data: usage } = await api.get(`/pm-checklists/${id}/usage`);
      if (usage.sites > 0 && !(await confirm({
        title: "Save changes to a template in use?",
        message: `It is assigned at ${usage.sites === 1 ? "1 site" : `${usage.sites} sites`}, and changes apply to their next rounds.` +
          (usage.rounds > 0 ? ` Reworded questions also read the new way on the ${usage.rounds} round${usage.rounds === 1 ? "" : "s"} already filed.` : ""),
        confirmLabel: "Save changes",
        destructive: false,
      }))) return;
    } catch {
      // The warning is a courtesy; the save itself is still checked by the API.
    }

    setSaving(true);
    try {
      // Ids go back with each section and question, so the API updates them in
      // place — that is what keeps filed answers attached to their questions.
      const res = await api.put(`/pm-checklists/${id}`, {
        name: name.trim(),
        frequency,
        sections: sections.map((s) => ({
          id: s.id,
          title: s.title.trim(),
          answerOptions: s.answerOptions.length ? s.answerOptions : DEFAULT_OPTIONS,
          items: s.items.filter((it) => it.label.trim()).map((it) => ({ id: it.id, label: it.label.trim() })),
        })),
      });
      // Re-read the saved ids: new sections and questions only have one now,
      // and the next save must send it or it would create them a second time.
      setSections(
        (res.data.sections ?? []).map((s: PMSection) => ({
          ...s,
          _key: uid(),
          items: (s.items ?? []).map((it) => ({ ...it })),
        }))
      );
      setDirty(false);
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
    if (!(await confirm({
      title: "Remove this template?",
      message: `If any site has used “${name}”, it is archived instead: it leaves the library and can't be assigned again, sites already using it carry on, and it can be restored. A template never assigned is deleted.`,
    }))) return;
    setDeleting(true);
    try {
      await api.delete(`/pm-checklists/${id}`);
      router.push("/pm-checklists");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "Failed to delete.");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-5 sm:p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--tu-text-brand)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="px-4 py-5 sm:p-8 max-w-3xl mx-auto pb-32">
      {/* Header */}
      <Breadcrumbs
        items={[
          { label: "PM Checklists", href: "/pm-checklists" },
          { label: name || "Checklist" },
        ]}
      />

      {archivedAt && (
        <div className="tu-error-banner" role="status" style={{ marginBottom: 16 }}>
          This template is archived — it isn&apos;t in the library and can&apos;t be assigned to a site. Restore it from
          “Show archived templates” on the PM Checklists page.
        </div>
      )}

      {/* Name + frequency */}
      <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-5 mb-5">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-bold text-[var(--tu-text-subtle)] mb-1.5">Checklist Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
              placeholder="e.g. Monthly Generator PM"
              className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]/30 disabled:bg-[var(--tu-bg-secondary)] disabled:text-[var(--tu-text-subtle)]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--tu-text-subtle)] mb-1.5">Frequency</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              disabled={!canEdit}
              className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]/30 disabled:bg-[var(--tu-bg-secondary)]"
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
          <div className="tu-card" style={{ borderStyle: "dashed" }}>
            <EmptyState
              compact
              icon="checklist"
              title="No sections yet"
              hint="Sections group the questions a technician answers on their round."
              action={
                canEdit && (
                  <button onClick={addSection} className="tu-btn-secondary tu-btn-sm" type="button">
                    + Add the first section
                  </button>
                )
              }
            />
          </div>
        )}

        {sections.map((sec, si) => (
          <div key={sec._key} className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden">
            {/* Section header */}
            <div className="bg-[var(--tu-text-heading)] px-4 py-3 flex items-center gap-3">
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
                  className="text-white/40 hover:text-[var(--tu-on-danger)] text-xs font-bold transition-colors cursor-pointer shrink-0"
                >
                  Remove
                </button>
              )}
            </div>

            {/* Answer options */}
            <div className="px-4 py-3 border-b border-[var(--tu-border)] bg-[var(--tu-bg-secondary)]">
              <label className="block text-xs font-bold text-[var(--tu-text-subtle)] mb-1.5">Answer Options (comma-separated)</label>
              <input
                value={sec.answerOptions.join(", ")}
                onChange={(e) => updateAnswerOptions(sec._key, e.target.value)}
                disabled={!canEdit}
                placeholder="OK, NOT OK, N/A"
                className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]/30 bg-[var(--tu-bg-surface)] disabled:bg-[var(--tu-bg-secondary)] disabled:text-[var(--tu-text-subtle)]"
              />
              {sec.answerOptions.length > 0 && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {sec.answerOptions.map((opt, oi) => (
                    <span key={oi} className="bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-body)] text-xs font-semibold px-2 py-0.5 rounded-full">
                      {opt}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Items */}
            <div className="divide-y divide-[var(--tu-border)]">
              {sec.items.map((item, ii) => (
                <div key={ii} className="flex items-center gap-2 px-4 py-2.5">
                  <span className="text-xs text-[var(--tu-text-subtle)] w-6 shrink-0 text-right">{ii + 1}.</span>
                  <input
                    value={item.label}
                    onChange={(e) => updateItem(sec._key, ii, e.target.value)}
                    disabled={!canEdit}
                    placeholder="Checklist item…"
                    className="flex-1 text-sm border-0 focus:outline-none text-[var(--tu-text-heading)] placeholder-gray-300 disabled:bg-transparent disabled:cursor-default"
                  />
                  {canEdit && (
                    <button
                      onClick={() => removeItem(sec._key, ii)}
                      className="text-[var(--tu-text-disabled)] hover:text-[var(--tu-on-danger)] text-sm transition-colors cursor-pointer shrink-0"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {canEdit && (
                <button
                  onClick={() => addItem(sec._key)}
                  className="w-full text-left px-4 py-2.5 text-xs text-[var(--tu-text-brand)] font-semibold hover:bg-[var(--tu-soft-brand)] transition-colors cursor-pointer"
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
          className="w-full border border-dashed border-[var(--tu-border-strong)] rounded-xl py-3 text-sm text-[var(--tu-text-subtle)] hover:text-[var(--tu-text-brand)] hover:border-[var(--tu-text-brand)] transition-colors cursor-pointer"
        >
          + Add Section
        </button>
      )}

      {/* Sticky footer */}
      {canEdit && (
        <div className="fixed bottom-0 left-60 right-0 bg-[var(--tu-bg-surface)] border-t border-[var(--tu-border)] px-8 py-4 flex items-center gap-4">
          {error && <p className="text-sm text-[var(--tu-on-danger)] flex-1">{error}</p>}
          {saved && <p className="text-sm text-[var(--tu-on-success)] font-semibold flex-1">Saved successfully.</p>}
          {!error && !saved && <span className="flex-1" />}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-sm text-[var(--tu-on-danger)] hover:text-[var(--tu-on-danger)] font-semibold transition-colors cursor-pointer"
          >
            Remove template
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[var(--tu-text-brand)] text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-40 transition-colors cursor-pointer"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}

    </div>
  );
}
