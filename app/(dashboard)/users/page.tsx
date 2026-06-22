"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Role = "GENERAL_MANAGER" | "MANAGER" | "SUPERVISOR" | "CLIENT";

type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

const ROLE_CONFIG: Record<Role, { label: string; cls: string }> = {
  GENERAL_MANAGER: { label: "General Manager", cls: "bg-violet-50 text-violet-700" },
  MANAGER:         { label: "Manager",          cls: "bg-blue-50 text-blue-700"    },
  SUPERVISOR:      { label: "Supervisor",       cls: "bg-green-50 text-green-700"  },
  CLIENT:          { label: "Client",           cls: "bg-amber-50 text-amber-700"  },
};

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} aria-hidden="true">
          {Array.from({ length: 3 }).map((__, j) => (
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
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "SUPERVISOR" as Role });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const isManager = me?.role === "GENERAL_MANAGER" || me?.role === "MANAGER";

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

  async function createUser() {
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    if (!form.email.trim()) { setFormError("Email is required."); return; }
    if (!form.password.trim() || form.password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      await api.post("/auth/register", {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
      });
      setShowForm(false);
      setForm({ name: "", email: "", password: "", role: "SUPERVISOR" });
      fetchUsers();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setFormError(e?.response?.data?.error ?? "Failed to create user.");
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
            onClick={() => { setShowForm(true); setFormError(""); }}
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
            <h2 className="tu-card-title">New User</h2>
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
              <label className="tu-label">Password *</label>
              <input
                className="tu-input"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Min 6 characters"
              />
            </div>
            <div>
              <label className="tu-label">Role</label>
              <select
                className="tu-select"
                style={{ width: "100%" }}
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
              >
                <option value="SUPERVISOR">Supervisor</option>
                <option value="CLIENT">Client</option>
              </select>
              <p style={{ fontSize: 11, color: "var(--tu-text-subtle)", marginTop: 4 }}>
                Manager-level accounts are provisioned by an admin.
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
                onClick={createUser}
                disabled={saving}
                className="tu-btn-primary"
                style={{ opacity: saving ? 0.5 : 1 }}
              >
                {saving ? "Creating…" : "Create User"}
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
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows count={4} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    style={{ textAlign: "center", padding: "40px 24px", color: "var(--tu-text-body)", fontSize: 14 }}
                  >
                    {users.length === 0
                      ? "No users found."
                      : "No users match your search."}
                  </td>
                </tr>
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
