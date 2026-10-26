"use client";

import { useEffect, useState } from "react";
import PasswordChangeForm from "@/components/PasswordChangeForm";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ThemeToggle, { ThemeHint } from "@/components/ThemeToggle";
import { roleLabel, roleCls } from "@/lib/statuses";
import Switch from "@/components/Switch";
import EmailRulesCard from "@/components/EmailRulesCard";

type Role = "GENERAL_MANAGER" | "MANAGER" | "SUPERVISOR" | "TECHNICIAN" | "CLIENT";

// `inApp` is null for events that only ever exist as email, so no bell toggle is
// offered for them. `emailApplies` is false where the event is in-app only, or
// where this role is not on its email list — showing a switch that controls
// nothing is worse than showing none.
type Pref = {
  action: string;
  label: string;
  description: string;
  group: string;
  inApp: boolean | null;
  email: boolean;
  emailApplies: boolean;
  // Switched off for everyone by a general manager (Email Rules below): no
  // switch, since it would control nothing, but a word saying why.
  emailCompanyOff?: boolean;
  enabled: boolean;
};

type Channel = "IN_APP" | "EMAIL";

export default function SettingsPage() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savedPrefs, setSavedPrefs] = useState(false);
  const [pwChanged, setPwChanged] = useState(false);

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

  function togglePref(action: string, channel: Channel) {
    setPrefs((prev) =>
      prev.map((p) => {
        if (p.action !== action) return p;
        return channel === "EMAIL"
          ? { ...p, email: !p.email }
          : { ...p, inApp: !p.inApp, enabled: !p.inApp };
      })
    );
    setSavedPrefs(false);
  }

  async function savePrefs() {
    setSavingPrefs(true);
    setSavedPrefs(false);
    try {
      // Per-channel shape. Channels that do not apply are omitted rather than
      // sent as false, so a muted-by-policy event never gets a stored opt-out
      // that would linger if the policy later changed.
      const payload = Object.fromEntries(
        prefs.map((p) => [
          p.action,
          {
            ...(p.inApp === null ? {} : { IN_APP: p.inApp }),
            ...(p.emailApplies ? { EMAIL: p.email } : {}),
          },
        ])
      );
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
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${roleCls(role)}`}>
                {roleLabel(role)}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--tu-text-subtle)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>User ID</p>
              <p style={{ fontSize: 13, color: "var(--tu-text-body)", fontFamily: "monospace" }}>{user.id.slice(0, 8)}…</p>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--tu-text-subtle)" }}>
            To update your name or email, contact your system administrator.
          </p>
        </div>
      </div>

      {/* Password */}
      <div className="tu-card" style={{ marginBottom: 24 }}>
        <div className="tu-card-header">
          <h2 className="tu-card-title">Password</h2>
        </div>
        <div style={{ padding: "0 24px 24px" }}>
          <p style={{ fontSize: 14, color: "var(--tu-text-body)", marginBottom: 16 }}>
            Changing it signs you out on every other device.
          </p>
          {pwChanged && (
            <p role="status" style={{ fontSize: 13, fontWeight: 600, color: "var(--tu-on-success)", marginBottom: 12 }}>
              Password changed.
            </p>
          )}
          <PasswordChangeForm onDone={() => setPwChanged(true)} />
        </div>
      </div>

      {/* Appearance */}
      <div className="tu-card" style={{ marginBottom: 24 }}>
        <div className="tu-card-header">
          <h2 className="tu-card-title">Appearance</h2>
        </div>
        <div style={{ padding: "0 24px 24px" }}>
          <p style={{ fontSize: 14, color: "var(--tu-text-body)", marginBottom: 16 }}>
            Choose how the interface looks on this browser. The setting is stored locally,
            so each device can differ.
          </p>
          <ThemeToggle />
          <ThemeHint />
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
              <div
                style={{
                  display: "flex", justifyContent: "flex-end", gap: 16,
                  padding: "0 16px 6px", fontSize: 11, fontWeight: 600,
                  color: "var(--tu-text-subtle)", textTransform: "uppercase", letterSpacing: "0.04em",
                }}
              >
                <span style={{ width: 44, textAlign: "center" }}>In app</span>
                <span style={{ width: 44, textAlign: "center" }}>Email</span>
              </div>

              {groupPrefs(prefs).map(([group, rows]) => (
                <div key={group}>
                  <p
                    style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
                      textTransform: "uppercase", color: "var(--tu-text-subtle)",
                      padding: "14px 16px 6px",
                    }}
                  >
                    {group}
                  </p>
                  {rows.map((pref) => (
                    <div
                      key={pref.action}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 16px",
                        borderRadius: 8,
                        transition: "background 150ms",
                        background: pref.inApp || pref.email ? "var(--tu-bg-brand-soft)" : "transparent",
                      }}
                    >
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--tu-text-heading)" }}>
                          {pref.label}
                        </p>
                        <p style={{ fontSize: 12, color: "var(--tu-text-subtle)", marginTop: 2 }}>
                          {pref.description}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 16, flexShrink: 0, marginLeft: 16 }}>
                        <Switch
                          on={pref.inApp === true}
                          hidden={pref.inApp === null}
                          label={`${pref.label} in app`}
                          onToggle={() => togglePref(pref.action, "IN_APP")}
                        />
                        {pref.emailCompanyOff ? (
                          <span
                            title="Turned off for everyone in the company email rules"
                            style={{ width: 44, fontSize: 11, lineHeight: 1.2, textAlign: "center", color: "var(--tu-text-subtle)" }}
                          >
                            Off for all
                          </span>
                        ) : (
                          <Switch
                            on={pref.email}
                            hidden={!pref.emailApplies}
                            label={`${pref.label} by email`}
                            onToggle={() => togglePref(pref.action, "EMAIL")}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {role === "GENERAL_MANAGER" && <EmailRulesCard />}
    </div>
  );
}

/**
 * Groups the rows under their headings while keeping the server's order — both
 * of the groups and of the rows inside each. Fifteen switches in one column
 * reads as a wall; the headings are the only thing that makes it scannable.
 *
 * A Map preserves insertion order, so the first time a group is seen fixes
 * where it sits. No sort: the catalogue is already in a deliberate order, and
 * sorting alphabetically would put Inventory above Work orders.
 */
function groupPrefs(prefs: Pref[]): [string, Pref[]][] {
  const byGroup = new Map<string, Pref[]>();
  for (const pref of prefs) {
    const key = pref.group ?? "Other";
    const rows = byGroup.get(key);
    if (rows) rows.push(pref);
    else byGroup.set(key, [pref]);
  }
  return [...byGroup.entries()];
}
