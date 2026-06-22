"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Role = "GENERAL_MANAGER" | "MANAGER" | "SUPERVISOR" | "CLIENT";

const ROLE_LABELS: Record<Role, string> = {
  GENERAL_MANAGER: "General Manager",
  MANAGER:         "Manager",
  SUPERVISOR:      "Supervisor",
  CLIENT:          "Client",
};

const ROLE_CLS: Record<Role, string> = {
  GENERAL_MANAGER: "bg-violet-50 text-violet-700",
  MANAGER:         "bg-blue-50 text-blue-700",
  SUPERVISOR:      "bg-green-50 text-green-700",
  CLIENT:          "bg-amber-50 text-amber-700",
};

const PREF_LABELS: Record<string, { label: string; description: string }> = {
  WORK_ORDER_REQUESTED:   { label: "New Request",       description: "When a client submits a new work order" },
  WORK_ORDER_ACCEPTED:    { label: "Order Accepted",    description: "When a work order is accepted/moved to pending" },
  WORK_ORDER_REJECTED:    { label: "Order Rejected",    description: "When a work order is rejected" },
  WORK_ORDER_STARTED:     { label: "Work Started",      description: "When a work order moves to in-progress" },
  WORK_ORDER_COMPLETED:   { label: "Work Completed",    description: "When a work order is marked complete" },
};

type Pref = { action: string; enabled: boolean };

export default function SettingsPage() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savedPrefs, setSavedPrefs] = useState(false);

  useEffect(() => { fetchPrefs(); }, []);

  async function fetchPrefs() {
    setLoadingPrefs(true);
    try {
      const res = await api.get("/me/notification-preferences");
      setPrefs(res.data);
    } catch {
      // silent
    } finally {
      setLoadingPrefs(false);
    }
  }

  function togglePref(action: string) {
    setPrefs((prev) =>
      prev.map((p) => p.action === action ? { ...p, enabled: !p.enabled } : p)
    );
    setSavedPrefs(false);
  }

  async function savePrefs() {
    setSavingPrefs(true);
    setSavedPrefs(false);
    try {
      const payload = Object.fromEntries(prefs.map((p) => [p.action, p.enabled]));
      await api.put("/me/notification-preferences", payload);
      setSavedPrefs(true);
      setTimeout(() => setSavedPrefs(false), 2500);
    } catch {
      // silent
    } finally {
      setSavingPrefs(false);
    }
  }

  if (!user) return null;
  const role = user.role as Role;

  return (
    <div className="tu-page" style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 className="tu-page-title">Settings</h1>
        <p className="tu-page-sub">Manage your account preferences</p>
      </div>

      {/* Profile section */}
      <div className="tu-card" style={{ marginBottom: 24 }}>
        <div className="tu-card-header">
          <h2 className="tu-card-title">Profile</h2>
        </div>
        <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "var(--tu-bg-brand-soft)",
                color: "var(--tu-text-brand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                fontWeight: 700,
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              {user.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 16, color: "var(--tu-text-heading)" }}>{user.name}</p>
              <p style={{ fontSize: 14, color: "var(--tu-text-body)", marginTop: 2 }}>{user.email}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--tu-text-subtle)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Role</p>
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${ROLE_CLS[role]}`}>
                {ROLE_LABELS[role]}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--tu-text-subtle)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>User ID</p>
              <p style={{ fontSize: 13, color: "var(--tu-text-body)", fontFamily: "monospace" }}>{user.id.slice(0, 8)}…</p>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--tu-text-subtle)" }}>
            To update your name, email, or password, contact your system administrator.
          </p>
        </div>
      </div>

      {/* Notification preferences */}
      <div className="tu-card">
        <div className="tu-card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className="tu-card-title">Notification Preferences</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {savedPrefs && (
              <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>✓ Saved</span>
            )}
            <button
              type="button"
              onClick={savePrefs}
              disabled={savingPrefs || loadingPrefs}
              className="tu-btn-primary"
              style={{ opacity: savingPrefs || loadingPrefs ? 0.5 : 1 }}
            >
              {savingPrefs ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        <div style={{ padding: "0 24px 24px" }}>
          <p style={{ fontSize: 14, color: "var(--tu-text-body)", marginBottom: 16 }}>
            Choose which events send you push and in-app notifications.
          </p>
          {loadingPrefs ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="tu-skeleton" style={{ height: 52, borderRadius: 8 }} />
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {prefs.map((pref) => {
                const meta = PREF_LABELS[pref.action];
                if (!meta) return null;
                return (
                  <label
                    key={pref.action}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      borderRadius: 8,
                      cursor: "pointer",
                      transition: "background 150ms",
                      background: pref.enabled ? "var(--tu-bg-brand-soft)" : "transparent",
                    }}
                  >
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "var(--tu-text-heading)" }}>
                        {meta.label}
                      </p>
                      <p style={{ fontSize: 12, color: "var(--tu-text-subtle)", marginTop: 2 }}>
                        {meta.description}
                      </p>
                    </div>
                    <div style={{ position: "relative", display: "inline-block", width: 44, height: 24, flexShrink: 0, marginLeft: 16 }}>
                      <input
                        type="checkbox"
                        checked={pref.enabled}
                        onChange={() => togglePref(pref.action)}
                        style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
                      />
                      <span
                        onClick={() => togglePref(pref.action)}
                        style={{
                          position: "absolute",
                          inset: 0,
                          borderRadius: 12,
                          background: pref.enabled ? "var(--tu-text-brand)" : "var(--tu-border)",
                          transition: "background 200ms",
                          cursor: "pointer",
                        }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          left: pref.enabled ? 22 : 2,
                          top: 2,
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "#fff",
                          transition: "left 200ms",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                          pointerEvents: "none",
                        }}
                      />
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
