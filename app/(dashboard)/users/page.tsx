"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { EmptyRow } from "@/components/EmptyState";

type Role = "GENERAL_MANAGER" | "MANAGER" | "SUPERVISOR" | "CLIENT";

type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

const ROLE_CONFIG: Record<Role, { label: string; cls: string }> = {
  GENERAL_MANAGER: { label: "General Manager", cls: "bg-violet-50 text-violet-700" },
  MANAGER:         { label: "Manager",          cls: "bg-[var(--tu-soft-brand)] text-[var(--tu-on-brand)]"    },
  SUPERVISOR:      { label: "Supervisor",       cls: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]"  },
  CLIENT:          { label: "Client",           cls: "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]"  },
};

function SkeletonRows({ count, cols }: { count: number; cols: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} aria-hidden="true">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} style={{ padding: "14px 24px" }}>
              <div className="tu-skeleton" style={{ height: 14, borderRadius: 4 }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "SUPERVISOR" as Role });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const isManager = me?.role === "GENERAL_MANAGER" || me?.role === "MANAGER";
  // Only a General Manager can provision privileged (Manager / GM) accounts,
  // via the GM-only POST /users endpoint. Managers can still add front-line
  // staff (Supervisor / Client) through public self-registration.
  const isGM = me?.role === "GENERAL_MANAGER";
  const ROLE_OPTIONS: { value: Role; label: string }[] = isGM
    ? [
        { value: "MANAGER", label: "Manager" },
        { value: "SUPERVISOR", label: "Supervisor" },
        { value: "CLIENT", label: "Client" },
        { value: "GENERAL_MANAGER", label: "General Manager" },
      ]
    : [
        { value: "SUPERVISOR", label: "Supervisor" },
        { value: "CLIENT", label: "Client" },
      ];

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get("/users");
      setUsers(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm({ name: "", email: "", password: "", role: "SUPERVISOR" });
    setFormError("");
    setShowForm(true);
  }

  function openEdit(u: User) {
    setEditingId(u.id);
    setForm({ name: u.name, email: u.email, password: "", role: u.role });
    setFormError("");
    setShowForm(true);
  }

  async function saveUser() {
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    if (!form.email.trim()) { setFormError("Email is required."); return; }
    // Password is required when creating; on edit a blank field keeps the
    // current password, but a non-blank one still has to meet the minimum.
    if (!editingId && (!form.password.trim() || form.password.length < 6)) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    if (editingId && form.password && form.password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      if (editingId) {
        const payload: { name: string; email: string; role: Role; password?: string } = {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          role: form.role,
        };
        if (form.password) payload.password = form.password;
        await api.patch(`/users/${editingId}`, payload);
      } else {
        // GMs provision through the privileged endpoint (any role); everyone
        // else uses public self-registration (Supervisor / Client only).
        const endpoint = isGM ? "/users" : "/auth/register";
        await api.post(endpoint, {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          role: form.role,
        });
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ name: "", email: "", password: "", role: "SUPERVISOR" });
      fetchUsers();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setFormError(e?.response?.data?.error ?? `Failed to ${editingId ? "update" : "create"} user.`);
    } finally {
      setSaving(false);
    }
  }

  const filtered = users.filter((u) => {
    const matchSearch =
      !search.trim() ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "ALL" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const roleCounts = Object.fromEntries(
    (["GENERAL_MANAGER", "MANAGER", "SUPERVISOR", "CLIENT"] as Role[]).map((r) => [
      r,
      users.filter((u) => u.role === r).length,
    ])
  );

  return (
    <div className="tu-page">
      {/* Header */}
      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">Users</h1>
          <p className="tu-page-sub">
            {loading
              ? "Loading…"
              : `${users.length} users · ${roleCounts.MANAGER ?? 0} managers · ${roleCounts.SUPERVISOR ?? 0} supervisors · ${roleCounts.CLIENT ?? 0} clients`}
          </p>
        </div>
        {isManager && (
          <button
            onClick={openCreate}
            className="tu-btn-primary"
            type="button"
          >
            + New User
          </button>
        )}
      </div>

      {error && (
        <div className="tu-error-banner" role="alert">Failed to load users.</div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="tu-card" style={{ marginBottom: 24 }}>
          <div className="tu-card-header">
            <h2 className="tu-card-title">{editingId ? "Edit User" : "New User"}</h2>
          </div>
          <div style={{ padding: "0 24px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label className="tu-label">Name *</label>
              <input
                className="tu-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
                autoFocus
              />
            </div>
            <div>
              <label className="tu-label">Email *</label>
              <input
                className="tu-input"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="tu-label">{editingId ? "New Password" : "Password *"}</label>
              <input
                className="tu-input"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={editingId ? "Leave blank to keep current" : "Min 6 characters"}
              />
            </div>
            <div>
              <label className="tu-label">Role</label>
              <select
                className="tu-select"
                style={{ width: "100%" }}
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
                disabled={editingId === me?.id}
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p style={{ fontSize: 11, color: "var(--tu-text-subtle)", marginTop: 4 }}>
                {editingId === me?.id
                  ? "You can't change your own role."
                  : isGM
                  ? "Managers and General Managers have full administrative access."
                  : "Manager-level accounts are provisioned by an admin."}
              </p>
            </div>
            {formError && (
              <div style={{ gridColumn: "span 2" }}>
                <p style={{ color: "#C70036", fontSize: 13 }}>{formError}</p>
              </div>
            )}
            <div style={{ gridColumn: "span 2", display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="tu-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveUser}
                disabled={saving}
                className="tu-btn-primary"
                style={{ opacity: saving ? 0.5 : 1 }}
              >
                {saving
                  ? (editingId ? "Saving…" : "Creating…")
                  : (editingId ? "Save Changes" : "Create User")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="tu-input"
          style={{ width: 240 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email…"
        />
        <div className="tu-filter-group" role="group" aria-label="Filter by role">
          <button
            type="button"
            onClick={() => setRoleFilter("ALL")}
            className={`tu-period-pill${roleFilter === "ALL" ? " tu-active-pill" : ""}`}
          >
            All ({users.length})
          </button>
          {(["GENERAL_MANAGER", "MANAGER", "SUPERVISOR", "CLIENT"] as Role[]).filter((r) => (roleCounts[r] ?? 0) > 0).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleFilter(r)}
              className={`tu-period-pill${roleFilter === r ? " tu-active-pill" : ""}`}
            >
              {ROLE_CONFIG[r].label} ({roleCounts[r]})
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="tu-card">
        <div style={{ overflowX: "auto" }}>
          <table className="tu-table" aria-label="Users">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                {isGM && <th scope="col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows count={4} cols={isGM ? 4 : 3} />
              ) : users.length === 0 ? (
                <EmptyRow
                  colSpan={isGM ? 4 : 3}
                  icon="employee"
                  title="No users yet"
                  hint="Users are the people who sign in. Create one to give a manager, supervisor, or client access."
                />
              ) : filtered.length === 0 ? (
                <EmptyRow
                  colSpan={isGM ? 4 : 3}
                  icon="search"
                  title="No matching users"
                  hint="Nothing matches the current search."
                />
              ) : (
                filtered.map((u) => {
                  const cfg = ROLE_CONFIG[u.role];
                  const isMe = u.id === me?.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <span className="tu-strong">{u.name}</span>
                        {isMe && (
                          <span
                            style={{ marginLeft: 6, fontSize: 11, color: "var(--tu-text-subtle)" }}
                            aria-label="This is you"
                          >
                            (you)
                          </span>
                        )}
                      </td>
                      <td style={{ color: "var(--tu-text-body)" }}>{u.email}</td>
                      <td>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                      </td>
                      {isGM && (
                        <td>
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            className="text-xs font-semibold text-[var(--tu-text-brand)] hover:underline cursor-pointer"
                          >
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
