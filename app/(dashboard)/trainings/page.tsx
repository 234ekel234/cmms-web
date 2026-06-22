"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Training = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  durationHours: number | null;
};

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} aria-hidden="true">
          {Array.from({ length: 5 }).map((__, j) => (
            <td key={j} style={{ padding: "14px 24px" }}>
              <div className="tu-skeleton" style={{ height: 14, borderRadius: 4 }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function TrainingsPage() {
  const { user } = useAuth();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", category: "", durationHours: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canEdit = user?.role === "GENERAL_MANAGER" || user?.role === "MANAGER";

  useEffect(() => { fetchTrainings(); }, []);

  async function fetchTrainings() {
    setLoading(true);
    try {
      const res = await api.get("/trainings");
      setTrainings(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditId(null);
    setForm({ title: "", description: "", category: "", durationHours: "" });
    setFormError("");
    setShowForm(true);
  }

  function openEdit(t: Training) {
    setEditId(t.id);
    setForm({
      title: t.title,
      description: t.description ?? "",
      category: t.category ?? "",
      durationHours: t.durationHours != null ? String(t.durationHours) : "",
    });
    setFormError("");
    setShowForm(true);
  }

  async function save() {
    if (!form.title.trim()) { setFormError("Title is required."); return; }
    setFormError("");
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        durationHours: form.durationHours ? parseFloat(form.durationHours) : null,
      };
      if (editId) {
        const res = await api.put(`/trainings/${editId}`, payload);
        setTrainings((prev) => prev.map((t) => t.id === editId ? res.data : t));
      } else {
        const res = await api.post("/trainings", payload);
        setTrainings((prev) => [...prev, res.data]);
      }
      setShowForm(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setFormError(e?.response?.data?.error ?? "Failed to save training.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTraining(id: string) {
    setDeletingId(id);
    try {
      await api.delete(`/trainings/${id}`);
      setTrainings((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // silent
    } finally {
      setDeletingId(null);
    }
  }

  const categories = ["ALL", ...Array.from(new Set(trainings.map((t) => t.category ?? "Uncategorized"))).sort()];

  const filtered = trainings.filter((t) => {
    const matchSearch = !search.trim() ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.category?.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "ALL" || (t.category ?? "Uncategorized") === catFilter;
    return matchSearch && matchCat;
  });

  // Group by category for display
  const groups = categories.filter((c) => c !== "ALL").filter((c) =>
    filtered.some((t) => (t.category ?? "Uncategorized") === c)
  );

  return (
    <div className="tu-page">
      {/* Header */}
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Training Library</h1>
          <p className="tu-page-sub">
            {loading ? "Loading…" : `${trainings.length} training module${trainings.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="tu-btn-primary"
            type="button"
          >
            + New Training
          </button>
        )}
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <div className="tu-card" style={{ marginBottom: 24 }}>
          <div className="tu-card-header">
            <h2 className="tu-card-title">{editId ? "Edit Training" : "New Training Module"}</h2>
          </div>
          <div style={{ padding: "0 24px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ gridColumn: "span 2" }}>
              <label className="tu-label">Title *</label>
              <input
                className="tu-input"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Fire Safety Procedures"
                autoFocus
              />
            </div>
            <div>
              <label className="tu-label">Category</label>
              <input
                className="tu-input"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Safety, Technical, Compliance"
              />
            </div>
            <div>
              <label className="tu-label">Duration (hours)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                className="tu-input"
                value={form.durationHours}
                onChange={(e) => setForm((f) => ({ ...f, durationHours: e.target.value }))}
                placeholder="e.g. 2"
              />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label className="tu-label">Description</label>
              <textarea
                className="tu-input"
                style={{ resize: "vertical", minHeight: 80 }}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What this training covers…"
              />
            </div>
            {formError && (
              <div style={{ gridColumn: "span 2" }}>
                <p style={{ color: "#C70036", fontSize: 13 }}>{formError}</p>
              </div>
            )}
            <div style={{ gridColumn: "span 2", display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowForm(false)} className="tu-btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="tu-btn-primary"
                style={{ opacity: saving ? 0.5 : 1 }}
              >
                {saving ? "Saving…" : (editId ? "Save Changes" : "Create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search + category filter */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="tu-input"
          style={{ width: 240 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, category…"
        />
        <div className="tu-filter-group" role="group" aria-label="Filter by category">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCatFilter(c)}
              className={`tu-period-pill${catFilter === c ? " tu-active-pill" : ""}`}
            >
              {c === "ALL" ? `All (${trainings.length})` : c}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="tu-card">
          <table className="tu-table">
            <tbody><SkeletonRows count={4} /></tbody>
          </table>
        </div>
      ) : filtered.length === 0 ? (
        <div className="tu-card" style={{ padding: "48px 24px", textAlign: "center" }}>
          <p style={{ color: "var(--tu-text-body)", fontSize: 14 }}>
            {trainings.length === 0 ? "No training modules yet." : "No modules match your search."}
          </p>
          {canEdit && trainings.length === 0 && (
            <button
              onClick={openCreate}
              className="tu-btn-primary"
              style={{ marginTop: 12 }}
              type="button"
            >
              Create the first module
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {(catFilter === "ALL" ? groups : [catFilter]).map((cat) => {
            const items = filtered.filter((t) => (t.category ?? "Uncategorized") === cat);
            if (!items.length) return null;
            return (
              <div key={cat}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--tu-text-subtle)",
                    marginBottom: 8,
                  }}
                >
                  {cat}
                </p>
                <div className="tu-card">
                  <div style={{ overflowX: "auto" }}>
                    <table className="tu-table" aria-label={`${cat} trainings`}>
                      <thead>
                        <tr>
                          <th scope="col">Title</th>
                          <th scope="col">Description</th>
                          <th scope="col" style={{ width: 100 }}>Duration</th>
                          {canEdit && <th scope="col" style={{ width: 110 }}></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((t) => (
                          <tr key={t.id}>
                            <td className="tu-strong">{t.title}</td>
                            <td style={{ color: "var(--tu-text-body)" }}>
                              {t.description ?? <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                            </td>
                            <td style={{ color: "var(--tu-text-body)" }}>
                              {t.durationHours != null
                                ? `${t.durationHours}h`
                                : <span style={{ color: "var(--tu-text-subtle)" }}>—</span>}
                            </td>
                            {canEdit && (
                              <td>
                                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                  <button
                                    type="button"
                                    onClick={() => openEdit(t)}
                                    style={{ fontSize: 12, color: "var(--tu-text-brand)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteTraining(t.id)}
                                    disabled={deletingId === t.id}
                                    style={{ fontSize: 12, color: "#C70036", background: "none", border: "none", cursor: "pointer", fontWeight: 600, opacity: deletingId === t.id ? 0.5 : 1 }}
                                  >
                                    {deletingId === t.id ? "…" : "Delete"}
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
