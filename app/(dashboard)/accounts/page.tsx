"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import RowMenu from "@/components/RowMenu";
import EmptyState from "@/components/EmptyState";

type Account = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
};

/** Per-account operational figures, from the dashboard endpoint. */
type AccountStats = {
  id: string;
  openWorkOrders: number;
  requestedWorkOrders: number;
  overdueWorkOrders: number;
  poorHealthAssets: number;
  checklistsDone: number;
  checklistsTotal: number;
};

type ShiftInput = { name: string; startTime: string; endTime: string };

const DEFAULT_SHIFT: ShiftInput = { name: "Day Shift", startTime: "08:00", endTime: "17:00" };

type SortKey = "ATTENTION" | "NAME" | "OPEN";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "ATTENTION", label: "Needs attention" },
  { key: "OPEN", label: "Most open work" },
  { key: "NAME", label: "Name A–Z" },
];

function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export default function AccountsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Stats arrive separately — see loadStats().
  const [stats, setStats] = useState<Record<string, AccountStats> | null>(null);

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("ATTENTION");

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // The API requires at least one shift on an account, so the form always
  // starts with one row and never lets the last one be removed.
  const [shifts, setShifts] = useState<ShiftInput[]>([{ ...DEFAULT_SHIFT }]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Edit is a separate, much smaller dialog: the API only exposes name and
  // description on PATCH, so shifts are not editable from here.
  const [editing, setEditing] = useState<Account | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const canManage = user?.role === "GENERAL_MANAGER" || user?.role === "MANAGER";

  async function fetchAccounts() {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get("/accounts");
      setAccounts(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  // /dashboard is a heavy endpoint (trends, activity, several group-bys), so it
  // is fetched alongside — not before — the account list. The table renders on
  // the fast call and the figures fill in when this resolves. A failure here is
  // silent: the list is still perfectly usable without the numbers.
  async function loadStats() {
    try {
      const res = await api.get("/dashboard", { params: { period: "today" } });
      const map: Record<string, AccountStats> = {};
      for (const a of res.data.accounts ?? []) map[a.id] = a;
      setStats(map);
    } catch {
      setStats({});
    }
  }

  // Declared after both loaders so neither is referenced before initialisation.
  useEffect(() => {
    fetchAccounts();
    loadStats();
  }, []);

  function updateShift(index: number, field: keyof ShiftInput, value: string) {
    setShifts((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function addShift() {
    setShifts((prev) => [...prev, { name: "", startTime: "", endTime: "" }]);
  }

  function removeShift(index: number) {
    setShifts((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function closeForm() {
    setShowForm(false);
    setFormError("");
  }

  async function createAccount() {
    if (!name.trim()) { setFormError("Account name is required."); return; }

    for (const [i, s] of shifts.entries()) {
      if (!s.name.trim()) { setFormError(`Shift ${i + 1}: name is required.`); return; }
      if (!s.startTime || !s.endTime) { setFormError(`Shift ${i + 1}: start and end time are required.`); return; }
      if (s.startTime === s.endTime) { setFormError(`Shift ${i + 1}: start and end time cannot be the same.`); return; }
    }
    const names = shifts.map((s) => s.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) { setFormError("Shift names must be unique."); return; }

    setFormError("");
    setSaving(true);
    try {
      const res = await api.post("/accounts", {
        name: name.trim(),
        description: description.trim() || null,
        shifts: shifts.map((s) => ({ name: s.name.trim(), startTime: s.startTime, endTime: s.endTime })),
      });
      setAccounts((prev) => [res.data, ...prev]);
      setShowForm(false);
      setName("");
      setDescription("");
      setShifts([{ ...DEFAULT_SHIFT }]);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setFormError(e?.response?.data?.error ?? "Failed to create account.");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(acc: Account) {
    setEditing(acc);
    setEditName(acc.name);
    setEditDesc(acc.description ?? "");
    setEditError("");
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editName.trim()) { setEditError("Account name is required."); return; }
    setEditSaving(true);
    setEditError("");
    try {
      const res = await api.patch(`/accounts/${editing.id}`, {
        name: editName.trim(),
        description: editDesc.trim() || null,
      });
      setAccounts((prev) =>
        prev.map((a) => (a.id === editing.id ? { ...a, name: res.data.name, description: res.data.description } : a)),
      );
      setEditing(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setEditError(e?.response?.data?.error ?? "Failed to save changes.");
    } finally {
      setEditSaving(false);
    }
  }

  // Close the modal on Escape.
  useEffect(() => {
    if (!showForm) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) closeForm();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showForm, saving]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? accounts.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            (a.description ?? "").toLowerCase().includes(q),
        )
      : accounts;

    const score = (a: Account) => {
      const s = stats?.[a.id];
      if (!s) return 0;
      // Overdue work is the loudest signal, then failing assets, then volume.
      return s.overdueWorkOrders * 100 + s.poorHealthAssets * 10 + s.openWorkOrders;
    };

    const sorted = [...filtered];
    if (sortKey === "NAME") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortKey === "OPEN") {
      sorted.sort((a, b) => (stats?.[b.id]?.openWorkOrders ?? 0) - (stats?.[a.id]?.openWorkOrders ?? 0));
    } else {
      sorted.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
    }
    return sorted;
  }, [accounts, query, sortKey, stats]);

  const totals = useMemo(() => {
    if (!stats) return null;
    const list = accounts.map((a) => stats[a.id]).filter(Boolean);
    return {
      open: list.reduce((n, s) => n + s.openWorkOrders, 0),
      overdue: list.reduce((n, s) => n + s.overdueWorkOrders, 0),
      atRisk: list.reduce((n, s) => n + s.poorHealthAssets, 0),
    };
  }, [accounts, stats]);

  /** Renders a figure, or a placeholder while stats are still loading. */
  function Figure({ value, tone }: { value: number; tone?: "danger" | "warning" }) {
    if (!stats) return <span className="tu-figure-pending" aria-hidden="true">—</span>;
    if (value === 0) return <span className="tu-figure-zero">—</span>;
    return <span className={tone ? `tu-figure tu-figure-${tone}` : "tu-figure"}>{value}</span>;
  }

  return (
    <div className="tu-page">
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Accounts</h1>
          <p className="tu-page-sub">
            {totals
              ? `${accounts.length} account${accounts.length === 1 ? "" : "s"} · ${totals.open} open work order${totals.open === 1 ? "" : "s"}${totals.overdue > 0 ? ` · ${totals.overdue} overdue` : ""}`
              : "All maintenance accounts"}
          </p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(true)} className="tu-btn-primary">
            + New Account
          </button>
        )}
      </div>

      {error && (
        <div className="tu-error-banner" role="alert">
          Failed to load accounts. Try refreshing.
        </div>
      )}

      {accounts.length > 0 && (
        <div className="tu-toolbar">
          <label className="tu-search">
            <span className="tu-search-icon"><IconSearch /></span>
            <input
              className="tu-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accounts…"
              aria-label="Search accounts"
            />
          </label>
          <label className="tu-toolbar-spacer" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 500, color: "var(--tu-text-subtle)" }}>
            Sort
            <select
              className="tu-select"
              style={{ minWidth: 160, padding: "6px 30px 6px 10px", fontSize: 12.5 }}
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              aria-label="Sort accounts"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="tu-card">
        {loading ? (
          <table className="tu-table">
            <tbody>
              {[1, 2, 3, 4].map((i) => (
                <tr key={i}>
                  <td><div className="tu-skeleton" style={{ height: 16, width: "45%" }} /></td>
                  <td className="tu-center"><div className="tu-skeleton" style={{ height: 16, width: 28, margin: "0 auto" }} /></td>
                  <td className="tu-center"><div className="tu-skeleton" style={{ height: 16, width: 28, margin: "0 auto" }} /></td>
                  <td className="tu-center"><div className="tu-skeleton" style={{ height: 16, width: 28, margin: "0 auto" }} /></td>
                  <td className="tu-center"><div className="tu-skeleton" style={{ height: 16, width: 40, margin: "0 auto" }} /></td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        ) : accounts.length === 0 ? (
          <EmptyState
            icon="account"
            title="No accounts yet"
            hint={
              canManage
                ? "Accounts are the sites you maintain. Create the first one to start logging work orders and assets."
                : "You have not been assigned to any account yet. Ask a manager to add you."
            }
            action={
              canManage && (
                <button onClick={() => setShowForm(true)} className="tu-btn-primary" type="button">
                  + New Account
                </button>
              )
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="search"
            title="No matching accounts"
            hint={`Nothing matches “${query}”. Try a shorter search.`}
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tu-table tu-table-interactive">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col" className="tu-center">Open</th>
                  <th scope="col" className="tu-center">Overdue</th>
                  <th scope="col" className="tu-center">Assets at risk</th>
                  <th scope="col" className="tu-center">PM today</th>
                  <th scope="col"><span className="tu-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((acc) => {
                  const s = stats?.[acc.id];
                  return (
                    <tr key={acc.id} onClick={() => router.push(`/accounts/${acc.id}`)}>
                      <td className="tu-strong">
                        {/* Kept a real link so the row is reachable by keyboard;
                            the row onClick is a convenience for pointer users. */}
                        <Link href={`/accounts/${acc.id}`} className="tu-row-link" onClick={(e) => e.stopPropagation()}>
                          {acc.name}
                        </Link>
                        {acc.description && <span className="tu-row-sub">{acc.description}</span>}
                      </td>
                      <td className="tu-center"><Figure value={s?.openWorkOrders ?? 0} /></td>
                      <td className="tu-center"><Figure value={s?.overdueWorkOrders ?? 0} tone="danger" /></td>
                      <td className="tu-center"><Figure value={s?.poorHealthAssets ?? 0} tone="warning" /></td>
                      <td className="tu-center">
                        {!stats ? (
                          <span className="tu-figure-pending" aria-hidden="true">—</span>
                        ) : !s || s.checklistsTotal === 0 ? (
                          <span className="tu-figure-zero">—</span>
                        ) : (
                          <span
                            className={
                              s.checklistsDone >= s.checklistsTotal ? "tu-figure tu-figure-success" : "tu-figure"
                            }
                            title={`${s.checklistsDone} of ${s.checklistsTotal} active checklists completed today`}
                          >
                            {s.checklistsDone}/{s.checklistsTotal}
                          </span>
                        )}
                      </td>
                      <td className="tu-menu-cell">
                        <RowMenu
                          label={acc.name}
                          actions={[
                            { label: "Open workspace", onSelect: () => router.push(`/accounts/${acc.id}`) },
                            { label: "Work orders", onSelect: () => router.push(`/accounts/${acc.id}/work-orders`) },
                            { label: "Reports", onSelect: () => router.push(`/accounts/${acc.id}/reports`) },
                            ...(canManage ? [{ label: "Edit details", onSelect: () => openEdit(acc) }] : []),
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create account ──────────────────────────────────── */}
      {showForm && (
        <div className="tu-modal-overlay" onClick={() => !saving && closeForm()} role="presentation">
          <div
            className="tu-modal"
            style={{ maxWidth: 620 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="New account"
          >
            <div className="tu-modal-header">
              <h2 className="tu-modal-title">New Account</h2>
              <button className="tu-btn-ghost" onClick={closeForm} aria-label="Close" disabled={saving}>✕</button>
            </div>

            <div className="tu-modal-body">
              <div className="tu-field">
                <label className="tu-label" htmlFor="acc-name">Account Name *</label>
                <input
                  id="acc-name"
                  className="tu-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Main Building"
                  autoFocus
                />
              </div>

              <div className="tu-field">
                <label className="tu-label" htmlFor="acc-desc">Description</label>
                <input
                  id="acc-desc"
                  className="tu-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>

              <div style={{ borderTop: "1px solid var(--tu-border)", paddingTop: 16, marginTop: 4 }}>
                <div className="tu-card-header" style={{ padding: 0, border: "none", marginBottom: 12 }}>
                  <p className="tu-label" style={{ margin: 0 }}>Shifts *</p>
                  <button type="button" onClick={addShift} className="tu-link">+ Add Shift</button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {shifts.map((s, i) => (
                    <div key={i} className="tu-shift-row">
                      <div>
                        <label htmlFor={`shift-name-${i}`} className="tu-shift-label">Shift Name</label>
                        <input
                          id={`shift-name-${i}`}
                          className="tu-input"
                          value={s.name}
                          onChange={(e) => updateShift(i, "name", e.target.value)}
                          placeholder="e.g. Day Shift"
                        />
                      </div>
                      <div>
                        <label htmlFor={`shift-start-${i}`} className="tu-shift-label">Start</label>
                        <input
                          id={`shift-start-${i}`}
                          type="time"
                          className="tu-input"
                          value={s.startTime}
                          onChange={(e) => updateShift(i, "startTime", e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor={`shift-end-${i}`} className="tu-shift-label">End</label>
                        <input
                          id={`shift-end-${i}`}
                          type="time"
                          className="tu-input"
                          value={s.endTime}
                          onChange={(e) => updateShift(i, "endTime", e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeShift(i)}
                        disabled={shifts.length === 1}
                        aria-label={`Remove shift ${i + 1}`}
                        title={shifts.length === 1 ? "An account needs at least one shift" : "Remove shift"}
                        className="tu-shift-remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <p className="tu-empty-hint" style={{ marginTop: 10, maxWidth: "none" }}>
                  An account needs at least one shift. Overnight shifts are fine — set the end time earlier than the start.
                </p>
              </div>

              {formError && (
                <p className="tu-form-error" role="alert">{formError}</p>
              )}
            </div>

            <div className="tu-modal-footer">
              <button onClick={closeForm} className="tu-btn-secondary" disabled={saving}>Cancel</button>
              <button onClick={createAccount} disabled={saving} className="tu-btn-primary">
                {saving ? "Creating…" : "Create Account"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Edit account ────────────────────────────────────── */}
      {editing && (
        <div className="tu-modal-overlay" onClick={() => !editSaving && setEditing(null)} role="presentation">
          <div
            className="tu-modal"
            style={{ maxWidth: 460 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${editing.name}`}
          >
            <div className="tu-modal-header">
              <h2 className="tu-modal-title">Edit account</h2>
              <button className="tu-btn-ghost" onClick={() => setEditing(null)} aria-label="Close" disabled={editSaving}>✕</button>
            </div>

            <div className="tu-modal-body">
              <div className="tu-field">
                <label className="tu-label" htmlFor="edit-name">Account Name *</label>
                <input
                  id="edit-name"
                  className="tu-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="tu-field">
                <label className="tu-label" htmlFor="edit-desc">Description</label>
                <input
                  id="edit-desc"
                  className="tu-input"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
              <p className="tu-empty-hint" style={{ maxWidth: "none" }}>
                Shifts and members are managed inside the account workspace.
              </p>
              {editError && <p className="tu-form-error" role="alert">{editError}</p>}
            </div>

            <div className="tu-modal-footer">
              <button onClick={() => setEditing(null)} className="tu-btn-secondary" disabled={editSaving}>Cancel</button>
              <button onClick={saveEdit} disabled={editSaving} className="tu-btn-primary">
                {editSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
