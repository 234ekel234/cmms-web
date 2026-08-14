"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { hasRole, MANAGERS } from "@/lib/rbac";
import EmptyState from "@/components/EmptyState";
import { workOrderStatusMeta } from "@/lib/statuses";
import {
  FREQUENCIES,
  FREQUENCY_LABEL,
  PERIOD_NOUN,
  PERIOD_UNIT,
  maxLeadDays,
  TONE_CLASS,
  dateInputValue,
  fmtDate,
  planState,
  type Frequency,
  type MaintenancePlan,
  type PlanOccurrence,
} from "@/lib/maintenancePlans";

type Asset = { id: string; name: string };
type Employee = { id: string; name: string; position: string | null };

export default function MaintenancePlanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.accountId as string;
  const planId = params.planId as string;
  const { user } = useAuth();
  const isManager = hasRole(user?.role, MANAGERS);

  const [plan, setPlan] = useState<MaintenancePlan | null>(null);
  const [occurrences, setOccurrences] = useState<PlanOccurrence[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [banner, setBanner] = useState("");

  const [form, setForm] = useState({
    title: "", description: "", category: "", frequency: "MONTHLY" as Frequency,
    priority: "MEDIUM", assetId: "", estHrs: "", estMins: "",
    leadDays: "", dueAfterDays: "", startDate: "", endDate: "",
  });
  const [assignees, setAssignees] = useState<string[]>([]);
  const [steps, setSteps] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, occ] = await Promise.all([
        api.get(`/maintenance-plans/${planId}`),
        api.get(`/maintenance-plans/${planId}/occurrences`),
      ]);
      setPlan(p.data);
      setOccurrences(occ.data);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  // Seed the edit form from the loaded plan whenever editing opens, so cancelling
  // and reopening always starts from what is actually stored.
  useEffect(() => {
    if (!editing || !plan) return;
    setForm({
      title: plan.title,
      description: plan.description ?? "",
      category: plan.category ?? "",
      frequency: plan.frequency,
      priority: plan.priority,
      assetId: plan.asset?.id ?? "",
      estHrs: plan.estimatedMinutes ? String(Math.floor(plan.estimatedMinutes / 60)) : "",
      estMins: plan.estimatedMinutes ? String(plan.estimatedMinutes % 60) : "",
      // 0 shows as blank, matching the create form's placeholder: "no lead
      // time" reads better as an empty box than as a zero the user must clear.
      leadDays: plan.generateOffsetDays ? String(plan.generateOffsetDays) : "",
      dueAfterDays: plan.dueAfterDays == null ? "" : String(plan.dueAfterDays),
      startDate: dateInputValue(plan.startDate),
      endDate: dateInputValue(plan.endDate),
    });
    setAssignees(plan.assignees.map((a) => a.employeeId));
    setSteps(plan.steps.map((s) => s.description));
    if (!assets.length) api.get(`/accounts/${accountId}/assets`).then((r) => setAssets(r.data)).catch(() => {});
    if (!employees.length) api.get(`/accounts/${accountId}/employees`).then((r) => setEmployees(r.data)).catch(() => {});
  }, [editing, plan, accountId, assets.length, employees.length]);

  async function save() {
    if (!form.title.trim()) { setFormError("Title is required."); return; }
    setFormError("");
    setSaving(true);
    const minutes = (parseInt(form.estHrs || "0", 10) || 0) * 60 + (parseInt(form.estMins || "0", 10) || 0);
    try {
      await api.patch(`/maintenance-plans/${planId}`, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        frequency: form.frequency,
        priority: form.priority,
        assetId: form.assetId || null,
        estimatedMinutes: minutes || null,
        generateOffsetDays: form.leadDays === "" ? 0 : Number(form.leadDays),
        dueAfterDays: form.dueAfterDays === "" ? null : Number(form.dueAfterDays),
        startDate: form.startDate || undefined,
        endDate: form.endDate || null,
        assignees,
        steps: steps.map((s) => s.trim()).filter(Boolean),
      });
      setEditing(false);
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setFormError(e?.response?.data?.error ?? "Failed to save the plan.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      const res = await api.delete(`/maintenance-plans/${planId}`);
      if (res.data?.paused) {
        // Plans that have raised work orders are paused rather than deleted —
        // the orders are real history and the rule behind them has to stay
        // resolvable.
        setBanner(res.data.reason ?? "This plan was paused instead of deleted.");
        load();
      } else {
        router.push(`/accounts/${accountId}/maintenance-plans`);
      }
    } catch {
      setBanner("Could not delete the plan.");
    }
  }

  const inputCls = "w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]";
  const labelCls = "block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1";

  if (loading) {
    return (
      <div className="p-8 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] animate-pulse" />
        ))}
      </div>
    );
  }

  if (notFound || !plan) {
    return (
      <div className="p-8">
        <div className="tu-card">
          <EmptyState icon="search" title="Plan not found" hint="It may have been deleted, or you may not have access to it." />
        </div>
      </div>
    );
  }

  const state = planState(plan);

  return (
    <div className="p-8">
      <Link href={`/accounts/${accountId}/maintenance-plans`} className="text-xs text-[var(--tu-text-brand)] hover:underline">
        ← Maintenance Plans
      </Link>

      <div className="flex items-start justify-between gap-4 mt-3 mb-6">
        <div>
          <h2 className="text-lg font-bold text-[var(--tu-text-heading)]">{plan.title}</h2>
          <p className="text-xs text-[var(--tu-text-subtle)] mt-1">
            {FREQUENCY_LABEL[plan.frequency]}
            {plan.asset ? <> · <Link href={`/accounts/${accountId}/assets/${plan.asset.id}`} className="text-[var(--tu-text-brand)] hover:underline">{plan.asset.name}</Link></> : null}
            {plan.category ? ` · ${plan.category}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={TONE_CLASS[state.tone]}>{state.label}</span>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-2 rounded-lg text-sm font-semibold border border-[var(--tu-border)] text-[var(--tu-text-body)] hover:bg-[var(--tu-bg-secondary)] cursor-pointer"
            >
              Edit
            </button>
          )}
          {isManager && !editing && (
            <button
              onClick={remove}
              className="px-3 py-2 rounded-lg text-sm font-semibold border border-[var(--tu-bd-danger)] text-[var(--tu-on-danger)] hover:bg-[var(--tu-soft-danger)] cursor-pointer"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div className="bg-[var(--tu-soft-info)] border border-[var(--tu-bd-info)] text-[var(--tu-on-info)] text-sm rounded-lg px-4 py-3 mb-6">
          {banner}
        </div>
      )}

      <p className="text-xs text-[var(--tu-text-subtle)] mb-6">{state.hint}</p>

      {editing ? (
        <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-6 mb-8">
          <h3 className="text-sm font-semibold text-[var(--tu-text-heading)] mb-4">Edit Plan</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Title *</label>
              <input className={inputCls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Repeats *</label>
              <select className={inputCls} value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as Frequency }))}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
              </select>
            </div>
            <div className="col-span-3">
              <label className={labelCls}>Description</label>
              <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Asset</label>
              <select className={inputCls} value={form.assetId} onChange={(e) => setForm((f) => ({ ...f, assetId: e.target.value }))}>
                <option value="">No specific asset</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select className={inputCls} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <input className={inputCls} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Estimated time</label>
              <div className="flex gap-2">
                <input className={inputCls} type="number" min={0} value={form.estHrs} onChange={(e) => setForm((f) => ({ ...f, estHrs: e.target.value }))} placeholder="Hours" />
                <input className={inputCls} type="number" min={0} max={59} value={form.estMins} onChange={(e) => setForm((f) => ({ ...f, estMins: e.target.value }))} placeholder="Minutes" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Raise it</label>
              {/* Bounded by what the API will accept. Unbounded, a daily plan
                  offered a field whose every non-zero value is a 400 on submit. */}
              <input className={inputCls} type="number" min={0} max={maxLeadDays(form.frequency)}
                disabled={maxLeadDays(form.frequency) === 0}
                value={form.leadDays}
                onChange={(e) => setForm((f) => ({ ...f, leadDays: e.target.value }))} placeholder="0" />
              <p className="text-[11px] text-[var(--tu-text-subtle)] mt-1">
                {maxLeadDays(form.frequency) === 0
                  ? `A daily plan is always raised on its own day.`
                  : `Days after the ${PERIOD_UNIT[form.frequency]} starts, up to ${maxLeadDays(form.frequency)}. Blank raises it on day one.`}
              </p>
            </div>
            <div>
              <label className={labelCls}>Due</label>
              <input className={inputCls} type="number" min={0} value={form.dueAfterDays}
                onChange={(e) => setForm((f) => ({ ...f, dueAfterDays: e.target.value }))} placeholder="End of period" />
              <p className="text-[11px] text-[var(--tu-text-subtle)] mt-1">
                Days after it is raised. Blank gives the job the whole {PERIOD_UNIT[form.frequency]}.
              </p>
            </div>

            <div>
              <label className={labelCls}>Starts</label>
              <input className={inputCls} type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Ends (optional)</label>
              <input className={inputCls} type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>

            <div className="col-span-3">
              <label className={labelCls}>Assign to</label>
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
              <p className="text-xs text-[var(--tu-text-subtle)] mt-2">
                Applies to work orders raised from now on. Who did an earlier period stays as it was.
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
                  <button
                    type="button"
                    onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                    className="px-3 text-sm text-[var(--tu-text-subtle)] border border-[var(--tu-border)] rounded-lg hover:bg-[var(--tu-bg-secondary)] cursor-pointer"
                    aria-label={`Remove step ${i + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setSteps((prev) => [...prev, ""])} className="text-xs text-[var(--tu-text-brand)] hover:underline cursor-pointer">
                + Add step
              </button>
            </div>
          </div>

          {formError && <p className="text-[var(--tu-on-danger)] text-xs mt-3">{formError}</p>}
          <div className="flex gap-3 justify-end mt-4">
            <button onClick={() => { setEditing(false); setFormError(""); }} className="px-4 py-2 text-sm text-[var(--tu-text-body)] border border-[var(--tu-border)] rounded-lg hover:bg-[var(--tu-bg-secondary)] cursor-pointer">
              Cancel
            </button>
            <button onClick={save} disabled={saving} className="px-4 py-2 text-sm text-white bg-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="tu-card col-span-2">
            <h3 className="text-sm font-semibold text-[var(--tu-text-heading)] mb-3">Details</h3>
            {plan.description && <p className="text-sm text-[var(--tu-text-body)] mb-4">{plan.description}</p>}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Repeats" value={FREQUENCY_LABEL[plan.frequency]} />
              <Field label="Priority" value={plan.priority.charAt(0) + plan.priority.slice(1).toLowerCase()} />
              <Field label="Estimated time" value={plan.estimatedMinutes ? `${Math.floor(plan.estimatedMinutes / 60)}h ${plan.estimatedMinutes % 60}m` : "—"} />
              <Field label="Asset" value={plan.asset?.name ?? "—"} />
              <Field label="Starts" value={fmtDate(plan.startDate)} />
              <Field label="Ends" value={plan.endDate ? fmtDate(plan.endDate) : "Open-ended"} />
              <Field
                label="Raised on"
                value={
                  // Null once the plan has passed its end date. Naming a day
                  // here would promise an occurrence that will never come.
                  plan.currentGenerateOn == null
                    ? "No further occurrences — the plan has ended"
                    : plan.generateOffsetDays > 0
                      ? `${fmtDate(plan.currentGenerateOn)} — day ${plan.generateOffsetDays + 1} of the ${PERIOD_UNIT[plan.frequency]}`
                      : `${fmtDate(plan.currentGenerateOn)} — first day of the ${PERIOD_UNIT[plan.frequency]}`
                }
              />
              <Field
                label="Due"
                value={
                  plan.dueAfterDays == null
                    ? `${fmtDate(plan.currentPeriodDue)} — end of the ${PERIOD_UNIT[plan.frequency]}`
                    : `${fmtDate(plan.currentPeriodDue)} — ${plan.dueAfterDays} day${plan.dueAfterDays === 1 ? "" : "s"} after it is raised`
                }
              />
              <Field label="Assigned to" value={plan.assignees.length ? plan.assignees.map((a) => a.employee.name).join(", ") : "Nobody yet"} />
            </dl>
          </div>

          <div className="tu-card">
            <h3 className="text-sm font-semibold text-[var(--tu-text-heading)] mb-3">Steps</h3>
            {plan.steps.length === 0 ? (
              <p className="text-xs text-[var(--tu-text-subtle)]">No steps defined. Each work order will be raised without a checklist.</p>
            ) : (
              <ol className="text-sm text-[var(--tu-text-body)] space-y-1.5 list-decimal list-inside">
                {plan.steps.map((s) => <li key={s.id}>{s.description}</li>)}
              </ol>
            )}
          </div>
        </div>
      )}

      <h3 className="text-sm font-semibold text-[var(--tu-text-heading)] mb-3">
        History
        <span className="ml-2 text-xs font-normal text-[var(--tu-text-subtle)]">
          every work order this plan has raised
        </span>
      </h3>
      {occurrences.length === 0 ? (
        <div className="tu-card">
          <EmptyState
            icon="workOrder"
            title="Nothing raised yet"
            hint={`No work order has been generated from this plan. The generator runs each morning and will raise one for ${PERIOD_NOUN[plan.frequency]}.`}
            compact
          />
        </div>
      ) : (
        <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--tu-bg-secondary)] text-xs text-[var(--tu-text-subtle)] font-semibold uppercase tracking-wide">
                <th className="px-6 py-3 text-left">Period</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Due</th>
                <th className="px-6 py-3 text-left">Completed</th>
                <th className="px-6 py-3 text-left">Who</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tu-border)]">
              {occurrences.map((o) => (
                <tr key={o.id} className="hover:bg-[var(--tu-bg-secondary)] transition-colors">
                  <td className="px-6 py-4">
                    <Link
                      href={`/accounts/${accountId}/work-orders/${o.id}`}
                      className="font-semibold text-[var(--tu-text-heading)] hover:text-[var(--tu-text-brand)] transition-colors"
                    >
                      {fmtDate(o.scheduledPeriod)}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className={workOrderStatusMeta(o.status).badge}>
                      {workOrderStatusMeta(o.status).label}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[var(--tu-text-subtle)] text-xs">{fmtDate(o.dueDate)}</td>
                  <td className="px-6 py-4 text-[var(--tu-text-subtle)] text-xs">{fmtDate(o.completedAt)}</td>
                  <td className="px-6 py-4 text-[var(--tu-text-subtle)] text-xs">
                    {o.assignments?.length ? o.assignments.map((a) => a.employee.name).join(", ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-[var(--tu-text-subtle)]">{label}</dt>
      <dd className="text-[var(--tu-text-body)]">{value}</dd>
    </div>
  );
}
