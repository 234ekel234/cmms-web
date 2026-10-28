"use client";

import { useEffect, useState } from "react";
import api, { errorMessage } from "@/lib/api";

/**
 * Accept a request and say who is doing it, in one step.
 *
 * Accepting and assigning were separate clicks, and the gap between them was a
 * state of its own — "Accepted — nobody assigned yet" — that jobs routinely
 * sat in. This picks the people first and then makes the same two calls the
 * separate buttons make (PATCH to PENDING, then one POST per person), so the
 * audit lines and the "you've been assigned" notices are exactly the ones those
 * routes already write. If an assignment fails after the accept went through,
 * the job is accepted and says so: the picker stays open with the message until
 * it is dismissed — the parent closes it on `onDone` — and the parent then gets
 * what actually landed.
 */
type Employee = { id: string; name: string; position: string | null };
type Assignment = { employeeId?: string; employee: { id: string; name: string; position: string | null } };

type Props = {
  order: { id: string; accountId: string; assignments: Assignment[] };
  /** What landed: the PATCHed order plus every assignment that succeeded. */
  onDone: (patch: Record<string, unknown> & { id: string; assignments: Assignment[] }) => void;
  onCancel: () => void;
};

export default function AcceptAndAssign({ order, onDone, onCancel }: Props) {
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // What landed when an assignment failed, held until the message is read.
  const [landed, setLanded] = useState<Parameters<Props["onDone"]>[0] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get(`/accounts/${order.accountId}/employees`)
      .then((res) => { if (!cancelled) setEmployees(res.data); })
      .catch(() => { if (!cancelled) setError("Couldn't load the roster."); });
    return () => { cancelled = true; };
  }, [order.accountId]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (picked.size === 0 || busy) return;
    setBusy(true);
    setError("");
    let accepted: Record<string, unknown>;
    try {
      accepted = (await api.patch(`/work-orders/${order.id}`, { status: "PENDING" })).data;
    } catch (err) {
      setError(errorMessage(err, "Couldn't accept it. Try again."));
      setBusy(false);
      return;
    }
    const assignments = [...order.assignments];
    const failed: string[] = [];
    for (const id of picked) {
      try {
        assignments.push((await api.post(`/work-orders/${order.id}/assignments`, { employeeId: id })).data);
      } catch {
        failed.push(employees?.find((e) => e.id === id)?.name ?? "someone");
      }
    }
    setBusy(false);
    const result = { ...accepted, id: order.id, assignments };
    if (failed.length === 0) return onDone(result);
    setLanded(result);
    setError(`Accepted, but couldn't assign ${failed.join(", ")}. Assign them from the job.`);
  }

  if (landed) {
    return (
      <div className="tu-accept-assign" role="group" aria-label="Accept and assign">
        <p className="tu-danger-text" role="alert" style={{ fontSize: 12.5 }}>{error}</p>
        <div className="tu-detail-actions">
          <button type="button" className="tu-sheet-action tu-sheet-action-brand" onClick={() => onDone(landed)} autoFocus>
            OK
          </button>
        </div>
      </div>
    );
  }

  const already = new Set(order.assignments.map((a) => a.employee.id));
  const choices = (employees ?? []).filter((e) => !already.has(e.id));

  return (
    <div className="tu-accept-assign" role="group" aria-label="Accept and assign">
      <p className="tu-accept-assign-q">Who&apos;s doing it?</p>
      {employees === null && !error && <div className="tu-skeleton" style={{ height: 64, borderRadius: 8 }} />}
      {employees && choices.length === 0 && (
        <p className="tu-detail-hint">Nobody on this site&apos;s roster to assign. Accept it and staff it later.</p>
      )}
      {choices.length > 0 && (
        <ul className="tu-accept-assign-list">
          {choices.map((e) => (
            <li key={e.id}>
              <label>
                <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} disabled={busy} />
                <span>{e.name}</span>
                {e.position && <span className="tu-accept-assign-pos">{e.position}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="tu-danger-text" role="alert" style={{ fontSize: 12.5 }}>{error}</p>}
      <div className="tu-detail-actions">
        <button type="button" className="tu-sheet-action tu-sheet-action-neutral" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="tu-sheet-action tu-sheet-action-brand" onClick={submit} disabled={busy || picked.size === 0}>
          {busy ? "Saving…" : picked.size > 1 ? `Accept & assign ${picked.size}` : "Accept & assign"}
        </button>
      </div>
    </div>
  );
}
