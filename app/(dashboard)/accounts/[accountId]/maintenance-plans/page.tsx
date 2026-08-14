"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { hasRole, MANAGERS } from "@/lib/rbac";
import EmptyState from "@/components/EmptyState";
import {
  FREQUENCIES,
  FREQUENCY_LABEL,
  PERIOD_NOUN,
  PERIOD_UNIT,
  TONE_CLASS,
  fmtDate,
  planState,
  type Frequency,
  type MaintenancePlan,
} from "@/lib/maintenancePlans";

type Asset = { id: string; name: string };
type Employee = { id: string; name: string; position: string | null };

export default function MaintenancePlansPage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const { user } = useAuth();
  const isManager = hasRole(user?.role, MANAGERS);

  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showPaused, setShowPaused] = useState(false);
  const [banner, setBanner] = useState("");

  const [showForm, setShowForm] = useState(false);
  const emptyForm = {
    title: "",
    description: "",
    category: "",
    frequency: "MONTHLY" as Frequency,
    priority: "MEDIUM",
    assetId: "",
    estHrs: "",
    estMins: "",
    leadDays: "",
    dueAfterDays: "",
    startDate: "",
    endDate: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [steps, setSteps] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [running, setRunning] = useState(false);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get(`/accounts/${accountId}/maintenance-plans`);
      setPlans(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  // Only needed once the form opens, so they are not fetched on page load.
  useEffect(() => {
    if (!showForm || assets.length || employees.length) return;
    api.get(`/accounts/${accountId}/assets`).then((r) => setAssets(r.data)).catch(() => {});
    api.get(`/accounts/${accountId}/employees`).then((r) => setEmployees(r.data)).catch(() => {});
  }, [showForm, accountId, assets.length, employees.length]);

  async function createPlan() {
    if (!form.title.trim()) { setFormError("Title is required."); return; }
    setFormError("");
    setSaving(true);
    const minutes =
      (parseInt(form.estHrs || "0", 10) || 0) * 60 + (parseInt(form.estMins || "0", 10) || 0);
    try {
      await api.post(`/accounts/${accountId}/maintenance-plans`, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        frequency: form.frequency,
        priority: form.priority,
        assetId: form.assetId || null,
        estimatedMinutes: minutes || null,
        // Blank is meaningful on both, and differently: no lead time means the
        // first day of the period, while no deadline means the end of it. Sent
        // as 0 and null respectively so the server reads the same intent.
        generateOffsetDays: form.leadDays === "" ? 0 : Number(form.leadDays),
        dueAfterDays: form.dueAfterDays === "" ? null : Number(form.dueAfterDays),
        startDate: form.startDate || undefined,
        endDate: form.endDate || null,
        assignees,
        steps: steps.map((s) => s.trim()).filter(Boolean),
      });
      setShowForm(false);
      setForm(emptyForm);
      setAssignees([]);
      setSteps([""]);
      fetchPlans();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setFormError(e?.response?.data?.error ?? "Failed to create the plan.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePaused(plan: MaintenancePlan) {
    try {
      await api.patch(`/maintenance-plans/${plan.id}`, { isActive: !plan.isActive });
      fetchPlans();
    } catch {
      setBanner("Could not change the plan. Try again.");
    }
  }

  // Generates any period that is due but not yet raised. Safe to press twice —
  // the backend's unique constraint means a period that already has its work
  // order simply gets none.
  async function generateNow() {
    setRunning(true);
    setBanner("");
    try {
      const res = await api.post(`/maintenance-plans/run`);
      const { created = 0 } = res.data ?? {};
      setBanner(
        created === 0
          ? "Nothing to raise — every active plan already has its work order for the current period."
          : `Raised ${created} work order${created === 1 ? "" : "s"}.`
      );
      fetchPlans();
    } catch {
      setBanner("Could not run the generator.");
    } finally {
      setRunning(false);
    }
  }

  const visible = plans.filter((p) => showPaused || p.isActive);
  const pausedCount = plans.filter((p) => !p.isActive).length;

  const inputCls = "w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]";
  const labelCls = "block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1";

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-2 gap-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--tu-text-heading)]">Maintenance Plans</h2>
          <p className="text-xs text-[var(--tu-text-subtle)] mt-1 max-w-2xl">
            Recurring work that consumes labour and parts — filter changes, greasing, deep cleans.
            Each period the plan raises one work order, whether or not the last one was finished.
            For recurring <em>inspections</em>, use{" "}
            <Link href={`/accounts/${accountId}/checklists`} className="text-[var(--tu-text-brand)] hover:underline">
              PM Checklists
            </Link>{" "}
            instead.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isManager && (
            <button
              onClick={generateNow}
              disabled={running}
              title="Raise any work order that is due for the current period but not yet created"
              className="px-3 py-2 rounded-lg text-sm font-semibold border border-[var(--tu-border)] text-[var(--tu-text-body)] hover:bg-[var(--tu-bg-secondary)] disabled:opacity-50 cursor-pointer"
            >
              {running ? "Running…" : "Generate Now"}
            </button>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="bg-[var(--tu-text-brand)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--tu-text-brand-strong)] transition-colors cursor-pointer"
          >
            + New Plan
          </button>
        </div>
      </div>

      {banner && (
        <div className="bg-[var(--tu-soft-info)] border border-[var(--tu-bd-info)] text-[var(--tu-on-info)] text-sm rounded-lg px-4 py-3 my-4">
          {banner}
        </div>
      )}

      {pausedCount > 0 && (
        <div className="flex mb-4 mt-4">
          <button
            onClick={() => setShowPaused((v) => !v)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
              showPaused
                ? "bg-[var(--tu-soft-info)] text-[var(--tu-on-info)] border-[var(--tu-bd-info)]"
                : "bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] border-[var(--tu-border)] hover:border-[var(--tu-border-strong)]"
            }`}
          >
            {showPaused ? "Hide" : "Show"} {pausedCount} paused
          </button>
        </div>
      )}

      {showForm && (
        <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-6 mb-6 mt-4">
          <h3 className="text-sm font-semibold text-[var(--tu-text-heading)] mb-4">New Maintenance Plan</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Title *</label>
              <input
                className={inputCls}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Replace HVAC filters"
                autoFocus
              />
            </div>
            <div>
              <label className={labelCls}>Repeats *</label>
              <select
                className={inputCls}
                value={form.frequency}
                onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as Frequency }))}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>
                ))}
              </select>
            </div>

            <div className="col-span-3">
              <label className={labelCls}>Description</label>
              <textarea
                className={inputCls}
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What the job involves"
              />
            </div>

            <div>
              <label className={labelCls}>Asset</label>
              <select
                className={inputCls}
                value={form.assetId}
                onChange={(e) => setForm((f) => ({ ...f, assetId: e.target.value }))}
              >
                <option value="">No specific asset</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select
                className={inputCls}
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              >
                {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
                  <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <input
                className={inputCls}
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="e.g. HVAC"
              />
            </div>

            <div>
              <label className={labelCls}>Estimated time</label>
              <div className="flex gap-2">
                <input className={inputCls} type="number" min={0} value={form.estHrs}
                  onChange={(e) => setForm((f) => ({ ...f, estHrs: e.target.value }))} placeholder="Hours" />
                <input className={inputCls} type="number" min={0} max={59} value={form.estMins}
                  onChange={(e) => setForm((f) => ({ ...f, estMins: e.target.value }))} placeholder="Minutes" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Raise it</label>
              <input className={inputCls} type="number" min={0} value={form.leadDays}
                onChange={(e) => setForm((f) => ({ ...f, leadDays: e.target.value }))}
                placeholder="0" />
              <p className="text-[11px] text-[var(--tu-text-subtle)] mt-1">
                Days after the {PERIOD_UNIT[form.frequency]} starts. Blank raises it on day one.
              </p>
            </div>
            <div>
              <label className={labelCls}>Due</label>
              <input className={inputCls} type="number" min={0} value={form.dueAfterDays}
                onChange={(e) => setForm((f) => ({ ...f, dueAfterDays: e.target.value }))}
                placeholder="End of period" />
              <p className="text-[11px] text-[var(--tu-text-subtle)] mt-1">
                Days after it is raised. Blank gives the job the whole {PERIOD_UNIT[form.frequency]}.
              </p>
            </div>

            <div>
              <label className={labelCls}>Starts</label>
              <input className={inputCls} type="date" value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Ends (optional)</label>
              <input className={inputCls} type="date" value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>

            <div className="col-span-3">
              <label className={labelCls}>Assign to</label>
              {employees.length === 0 ? (
                <p className="text-xs text-[var(--tu-text-subtle)]">No employees on this account yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {employees.map((emp) => {
                    const on = assignees.includes(emp.id);
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => setAssignees((a) => on ? a.filter((x) => x !== emp.id) : [...a, emp.id])}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                          on
                            ? "bg-[var(--tu-soft-info)] text-[var(--tu-on-info)] border-[var(--tu-bd-info)]"
                            : "bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] border-[var(--tu-border)] hover:border-[var(--tu-border-strong)]"
                        }`}
                      >
                        {emp.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-[var(--tu-text-subtle)] mt-2">
                Copied onto each work order this plan raises. Changing it later does not alter work already raised.
              </p>
            </div>

            <div className="col-span-3">
              <label className={labelCls}>Steps</label>
              {steps.map((s, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input
                    className={inputCls}
                    value={s}
                    onChange={(e) => setSteps((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                    placeholder={`Step ${i + 1}`}
                  />
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                      className="px-3 text-sm text-[var(--tu-text-subtle)] border border-[var(--tu-border)] rounded-lg hover:bg-[var(--tu-bg-secondary)] cursor-pointer"
                      aria-label={`Remove step ${i + 1}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSteps((prev) => [...prev, ""])}
                className="text-xs text-[var(--tu-text-brand)] hover:underline cursor-pointer"
              >
                + Add step
              </button>
            </div>
          </div>

          {formError && <p className="text-[var(--tu-on-danger)] text-xs mt-3">{formError}</p>}
          <div className="flex gap-3 justify-end mt-4">
            <button
              onClick={() => { setShowForm(false); setFormError(""); }}
              className="px-4 py-2 text-sm text-[var(--tu-text-body)] border border-[var(--tu-border)] rounded-lg hover:bg-[var(--tu-bg-secondary)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={createPlan}
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving..." : "Create Plan"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-[var(--tu-soft-danger)] border border-[var(--tu-bd-danger)] text-[var(--tu-on-danger)] text-sm rounded-lg px-4 py-3 mb-6">
          Failed to load maintenance plans.
        </div>
      )}

      {loading ? (
        <div className="space-y-3 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="tu-card mt-4">
          <EmptyState
            icon="schedule"
            title={plans.length === 0 ? "No maintenance plans yet" : "No active plans"}
            hint={
              plans.length === 0
                ? "Set up the recurring jobs this site needs — filter changes, greasing, deep cleans — and a work order will be raised for each period."
                : "Every plan on this account is paused."
            }
          />
        </div>
      ) : (
        <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--tu-bg-secondary)] text-xs text-[var(--tu-text-subtle)] font-semibold uppercase tracking-wide">
                <th className="px-6 py-3 text-left">Plan</th>
                <th className="px-6 py-3 text-left">Repeats</th>
                <th className="px-6 py-3 text-left">Asset</th>
                <th className="px-6 py-3 text-left">This period</th>
                <th className="px-6 py-3 text-left">Due</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tu-border)]">
              {visible.map((plan) => {
                const state = planState(plan);
                return (
                  <tr key={plan.id} className={`hover:bg-[var(--tu-bg-secondary)] transition-colors ${plan.isActive ? "" : "opacity-60"}`}>
                    <td className="px-6 py-4">
                      <Link
                        href={`/accounts/${accountId}/maintenance-plans/${plan.id}`}
                        className="font-semibold text-[var(--tu-text-heading)] hover:text-[var(--tu-text-brand)] transition-colors"
                      >
                        {plan.title}
                      </Link>
                      {plan.assignees.length > 0 && (
                        <div className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
                          {plan.assignees.map((a) => a.employee.name).join(", ")}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-[var(--tu-text-subtle)]">{FREQUENCY_LABEL[plan.frequency]}</td>
                    <td className="px-6 py-4 text-[var(--tu-text-subtle)]">{plan.asset?.name ?? "—"}</td>
                    <td className="px-6 py-4">
                      <span
                        className={TONE_CLASS[state.tone]}
                        title={state.hint}
                      >
                        {state.label}
                      </span>
                      {plan.currentOccurrence && (
                        <Link
                          href={`/accounts/${accountId}/work-orders/${plan.currentOccurrence.id}`}
                          className="block text-xs text-[var(--tu-text-brand)] hover:underline mt-1"
                        >
                          Open work order
                        </Link>
                      )}
                    </td>
                    <td className="px-6 py-4 text-[var(--tu-text-subtle)] text-xs">
                      {fmtDate(plan.currentPeriodDue)}
                      <div className="text-[var(--tu-text-disabled)]">
                        {plan.generateOffsetDays > 0
                          ? `raised ${fmtDate(plan.currentGenerateOn)}`
                          : `for ${PERIOD_NOUN[plan.frequency]}`}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => togglePaused(plan)}
                        className="text-xs font-semibold text-[var(--tu-text-body)] border border-[var(--tu-border)] rounded-lg px-3 py-1.5 hover:bg-[var(--tu-bg-secondary)] cursor-pointer"
                      >
                        {plan.isActive ? "Pause" : "Resume"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
