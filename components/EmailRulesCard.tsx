"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import Switch from "@/components/Switch";
import { roleLabel } from "@/lib/statuses";

type Rules = {
  off: string[];
  overdue: "NEW_ONLY" | "DAILY" | "WEEKLY";
  checklists: "FALLING_BEHIND" | "DAILY";
  checklistDaysBefore: number;
};
type Email = { action: string; label: string; description: string; group: string; roles: string[] };
type Response = {
  rules: Rules & { updatedAt: string | null; updatedByName: string | null };
  defaults: Rules;
  emails: Email[];
  options: { checklistDaysBefore: [number, number] };
};

const OVERDUE_LABEL: Record<Rules["overdue"], string> = {
  NEW_ONLY: "Only when something newly went overdue",
  DAILY: "Every morning there is overdue work",
  WEEKLY: "Mondays only",
};
const CHECKLIST_LABEL: Record<Rules["checklists"], string> = {
  FALLING_BEHIND: "Only when one is falling behind",
  DAILY: "Every morning one is unfinished",
};

const pick = ({ off, overdue, checklists, checklistDaysBefore }: Rules): Rules =>
  ({ off, overdue, checklists, checklistDaysBefore });

/**
 * The company's email rules — general managers only. Switches an email off for
 * everyone and sets how the two daily lists decide what is worth mailing. The
 * API (`/system/email-rules`, helpers/emailRules.js) is the authority; this
 * draws what it is sent, including which emails exist and who each reaches,
 * so a new email appears here without a change to this file.
 */
export default function EmailRulesCard() {
  const [data, setData] = useState<Response | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<Response>("/system/email-rules")
      .then((res) => { setData(res.data); setRules(pick(res.data.rules)); })
      .catch(() => setLoadError("Could not load the email rules."));
  }, []);

  function change(next: Partial<Rules>) {
    setRules((r) => (r ? { ...r, ...next } : r));
    setSaved(false);
    setSaveError("");
  }

  function toggle(action: string) {
    if (!rules) return;
    change({ off: rules.off.includes(action) ? rules.off.filter((a) => a !== action) : [...rules.off, action] });
  }

  async function save(body: Rules) {
    setSaving(true);
    setSaveError("");
    try {
      const res = await api.put<Response>("/system/email-rules", body);
      setData(res.data);
      setRules(pick(res.data.rules));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setSaveError(e?.response?.data?.error ?? "Could not save the email rules.");
    } finally {
      setSaving(false);
    }
  }

  const dirty = !!data && !!rules && JSON.stringify(pick(data.rules)) !== JSON.stringify(rules);
  const [minDays, maxDays] = data?.options.checklistDaysBefore ?? [1, 7];
  const groups = data ? groupEmails(data.emails) : [];

  return (
    <div className="tu-card" style={{ marginTop: 24 }}>
      <div className="tu-card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 className="tu-card-title">Email Rules for Everyone</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {saved && <span role="status" style={{ fontSize: 13, color: "var(--tu-on-success)", fontWeight: 600 }}>✓ Saved</span>}
          {data && (
            <button
              type="button"
              className="tu-btn-secondary"
              disabled={saving}
              onClick={() => save(data.defaults)}
            >
              Reset to defaults
            </button>
          )}
          <button
            type="button"
            className="tu-btn-primary"
            onClick={() => rules && save(rules)}
            disabled={!dirty || saving}
            style={{ opacity: !dirty || saving ? 0.5 : 1 }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div style={{ padding: "0 24px 24px" }}>
        <p style={{ fontSize: 14, color: "var(--tu-text-body)", marginBottom: 4 }}>
          Applies to the whole company. Turning an email off here stops it for everybody; each
          person can still turn off their own above. The app notifications are not affected.
        </p>
        {data?.rules.updatedAt && (
          <p style={{ fontSize: 12, color: "var(--tu-text-subtle)", marginBottom: 16 }}>
            Last changed {new Date(data.rules.updatedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
            {data.rules.updatedByName ? ` by ${data.rules.updatedByName}` : ""}.
          </p>
        )}
        {loadError && <p style={{ fontSize: 13, color: "var(--tu-on-danger)" }}>{loadError}</p>}
        {saveError && <p role="alert" style={{ fontSize: 13, color: "var(--tu-on-danger)", margin: "8px 0" }}>{saveError}</p>}

        {!rules || !data ? (
          !loadError && <div className="tu-skeleton" style={{ height: 240, borderRadius: 8, marginTop: 16 }} />
        ) : (
          <>
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", margin: "16px 0 8px" }}>
              <div className="tu-field">
                <label className="tu-label" htmlFor="rules-overdue">Overdue work (07:00)</label>
                <select
                  id="rules-overdue"
                  className="tu-select"
                  value={rules.overdue}
                  onChange={(e) => change({ overdue: e.target.value as Rules["overdue"] })}
                >
                  {(Object.keys(OVERDUE_LABEL) as Rules["overdue"][]).map((m) => (
                    <option key={m} value={m}>{OVERDUE_LABEL[m]}</option>
                  ))}
                </select>
              </div>
              <div className="tu-field">
                <label className="tu-label" htmlFor="rules-checklists">Checklists (08:00)</label>
                <select
                  id="rules-checklists"
                  className="tu-select"
                  value={rules.checklists}
                  onChange={(e) => change({ checklists: e.target.value as Rules["checklists"] })}
                >
                  {(Object.keys(CHECKLIST_LABEL) as Rules["checklists"][]).map((m) => (
                    <option key={m} value={m}>{CHECKLIST_LABEL[m]}</option>
                  ))}
                </select>
              </div>
              <div className="tu-field">
                <label className="tu-label" htmlFor="rules-days">Falling behind starts</label>
                <select
                  id="rules-days"
                  className="tu-select"
                  value={rules.checklistDaysBefore}
                  disabled={rules.checklists !== "FALLING_BEHIND"}
                  onChange={(e) => change({ checklistDaysBefore: Number(e.target.value) })}
                >
                  {Array.from({ length: maxDays - minDays + 1 }, (_, i) => minDays + i).map((d) => (
                    <option key={d} value={d}>{d} day{d === 1 ? "" : "s"} before the period ends</option>
                  ))}
                </select>
              </div>
            </div>
            <p style={{ fontSize: 12, color: "var(--tu-text-subtle)", marginBottom: 8 }}>
              A checklist missed last period is always mentioned once, the morning after.
              The full lists are in the app every morning whatever is chosen here.
            </p>

            {groups.map(([group, rows]) => (
              <div key={group}>
                <p style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
                  color: "var(--tu-text-subtle)", padding: "14px 16px 6px",
                }}>
                  {group}
                </p>
                {rows.map((e) => {
                  const on = !rules.off.includes(e.action);
                  return (
                    <div
                      key={e.action}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "12px 16px", borderRadius: 8,
                        background: on ? "var(--tu-bg-brand-soft)" : "transparent",
                      }}
                    >
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--tu-text-heading)" }}>{e.label}</p>
                        <p style={{ fontSize: 12, color: "var(--tu-text-subtle)", marginTop: 2 }}>
                          {e.description} · To {e.roles.map((r) => roleLabel(r)).join(", ")}
                        </p>
                      </div>
                      <div style={{ marginLeft: 16 }}>
                        <Switch on={on} label={`${e.label} email for everyone`} onToggle={() => toggle(e.action)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** Rows under their group headings, in the API's order. */
function groupEmails(emails: Email[]): [string, Email[]][] {
  const byGroup = new Map<string, Email[]>();
  for (const e of emails) {
    const rows = byGroup.get(e.group);
    if (rows) rows.push(e);
    else byGroup.set(e.group, [e]);
  }
  return [...byGroup.entries()];
}
