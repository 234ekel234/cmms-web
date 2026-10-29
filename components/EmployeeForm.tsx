"use client";

import { useState } from "react";
import api, { errorMessage } from "@/lib/api";
import { EMPLOYEE_CATEGORIES, orderSkills, skillLabel } from "@/lib/employeeCategories";

/** The fields an employee's details form edits. */
export type EmployeeDetails = {
  id?: string;
  name: string;
  position: string | null;
  /** Staff only — the API leaves it out for anyone else (backend/helpers/employeePhone.js). */
  phone?: string | null;
  categories: string[];
  isReliever: boolean;
};

type Props<T> = {
  /** The employee being edited, or omitted to create one. */
  employee?: EmployeeDetails;
  /** Called with the API's reply — the full employee row in its registry shape. */
  onSaved: (saved: T) => void;
  onCancel: () => void;
};

/**
 * Create or edit an employee's details: name, position, phone, regular or
 * reliever, and skills. Used by the registry and by the employee's own page, so
 * the two cannot drift into asking for different things.
 *
 * Skills are a fixed vocabulary (lib/employeeCategories) — picked, never typed.
 * Free text gave the same trade several spellings and a filter that offered all
 * of them, and the API rejects anything off the list anyway.
 */
export default function EmployeeForm<T>({ employee, onSaved, onCancel }: Props<T>) {
  const [form, setForm] = useState({
    name: employee?.name ?? "",
    position: employee?.position ?? "",
    phone: employee?.phone ?? "",
    categories: employee?.categories ?? [],
    isReliever: employee?.isReliever ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleCategory(cat: string) {
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(cat) ? f.categories.filter((c) => c !== cat) : orderSkills([...f.categories, cat]),
    }));
  }

  async function save() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setError("");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        position: form.position.trim() || null,
        phone: form.phone.trim() || null,
        categories: form.categories,
        isReliever: form.isReliever,
      };
      const res = employee?.id
        ? await api.put(`/employees/${employee.id}`, payload)
        : await api.post("/employees", payload);
      onSaved(res.data);
    } catch (err) {
      setError(errorMessage(err, "Failed to save employee."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tu-card-pad tu-form-grid">
      <div className="tu-span-2">
        <label className="tu-label" htmlFor="emp-name">Name *</label>
        <input
          id="emp-name"
          className="tu-input"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Full name"
          autoFocus
        />
      </div>
      <div>
        <label className="tu-label" htmlFor="emp-position">Position</label>
        <input
          id="emp-position"
          className="tu-input"
          value={form.position}
          onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
          placeholder="e.g. Electrician, Supervisor"
        />
      </div>
      <div>
        <label className="tu-label" htmlFor="emp-phone">Phone</label>
        <input
          id="emp-phone"
          className="tu-input"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          placeholder="e.g. 0917 123 4567"
        />
      </div>
      <div>
        <label className="tu-label" htmlFor="emp-type">Type</label>
        <select
          id="emp-type"
          className="tu-select"
          value={form.isReliever ? "RELIEVER" : "DEDICATED"}
          onChange={(e) => setForm((f) => ({ ...f, isReliever: e.target.value === "RELIEVER" }))}
        >
          <option value="DEDICATED">Regular — one account</option>
          <option value="RELIEVER">Reliever — multiple accounts</option>
        </select>
      </div>
      <div className="tu-span-2">
        <label className="tu-label">Skills</label>
        <p style={{ fontSize: 12, color: "var(--tu-text-subtle)", margin: "0 0 8px" }}>
          Tap every trade this person works in.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {EMPLOYEE_CATEGORIES.map((cat) => {
            const on = form.categories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                aria-pressed={on}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "4px 12px",
                  borderRadius: 9999,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: on ? "var(--tu-text-brand)" : "var(--tu-border)",
                  background: on ? "var(--tu-bg-brand-soft)" : "var(--tu-bg-surface)",
                  color: on ? "var(--tu-text-brand)" : "var(--tu-text-body)",
                }}
              >
                {skillLabel(cat)}
              </button>
            );
          })}
        </div>
      </div>
      {error && (
        <div className="tu-span-2">
          <p role="alert" style={{ color: "#C70036", fontSize: 13 }}>{error}</p>
        </div>
      )}
      <div className="tu-span-2 tu-form-actions">
        <button type="button" onClick={onCancel} className="tu-btn-secondary">Cancel</button>
        <button type="button" onClick={save} disabled={saving} className="tu-btn-primary" style={{ opacity: saving ? 0.5 : 1 }}>
          {saving ? "Saving…" : employee?.id ? "Save changes" : "Create"}
        </button>
      </div>
    </div>
  );
}
