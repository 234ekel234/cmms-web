"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { MANAGERS, canManage, hasRole } from "@/lib/rbac";
import { type CapacityUnit, MAX_UNIT_NAME, groupUnits } from "@/lib/assetCapacity";
import { useConfirm } from "@/components/ConfirmDialog";

/**
 * The capacity unit dropdown — a closed list that its users extend.
 *
 * The last option, "Add or manage units…", opens a small dialog instead of
 * selecting anything: add a unit there and it comes back selected. A closed
 * list rather than free text because the point of a capacity is to compare it,
 * and "kVA", "KVA" and "kva" would be three units; the API refuses a second
 * spelling of one already listed. Managers can also remove a unit no asset uses.
 */

const MANAGE = "__manage__";

export default function CapacityUnitSelect({
  value,
  onChange,
  className,
  style,
}: {
  value: string;
  onChange: (unit: string) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { user } = useAuth();
  const canAdd = canManage(user?.role);
  const [units, setUnits] = useState<CapacityUnit[]>([]);
  const [managing, setManaging] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/capacity-units");
      setUnits(res.data);
    } catch {
      // An empty dropdown says enough; the field is optional.
    }
  }, []);

  useEffect(() => {
    (async () => { await load(); })();
  }, [load]);

  // A stored unit since removed from the list still shows, rather than the
  // select silently reading "Unit" over an asset that has one.
  const missing = value && !units.some((u) => u.name === value);

  return (
    <>
      <select
        className={className}
        style={style}
        value={value}
        onChange={(e) => {
          if (e.target.value === MANAGE) { setManaging(true); return; }
          onChange(e.target.value);
        }}
        aria-label="Capacity unit"
      >
        <option value="">Unit</option>
        {missing && <option value={value}>{value}</option>}
        {groupUnits(units).map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.units.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
          </optgroup>
        ))}
        {canAdd && <option value={MANAGE}>+ Add or manage units…</option>}
      </select>
      {managing && (
        <UnitManager
          units={units}
          canRemove={hasRole(user?.role, MANAGERS)}
          onClose={() => setManaging(false)}
          onChanged={load}
          onAdded={(name) => { onChange(name); setManaging(false); }}
        />
      )}
    </>
  );
}

function UnitManager({
  units,
  canRemove,
  onClose,
  onChanged,
  onAdded,
}: {
  units: CapacityUnit[];
  canRemove: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onAdded: (name: string) => void;
}) {
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const groups = groupUnits(units).map((g) => g.group);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function add() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/capacity-units", { name: name.trim(), group: group.trim() });
      await onChanged();
      onAdded(res.data.name);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "Couldn't add that unit.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(u: CapacityUnit) {
    if (!(await confirm({
      title: "Remove this unit?",
      message: `“${u.name}” will no longer be offered in the capacity dropdown.`,
      confirmLabel: "Remove",
    }))) return;
    setBusy(true);
    setError("");
    try {
      await api.delete(`/capacity-units/${u.id}`);
      await onChanged();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "Couldn't remove that unit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tu-modal-overlay" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="tu-modal"
        style={{ maxWidth: 460 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unit-manager-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tu-modal-header">
          <h2 id="unit-manager-title" className="tu-modal-title">Capacity units</h2>
          <button className="tu-btn-ghost" onClick={onClose} aria-label="Close" disabled={busy}>✕</button>
        </div>
        <div className="tu-modal-body">
          <p className="tu-label" style={{ marginBottom: 6 }}>Add a unit</p>
          <div className="tu-unit-add">
            <input
              className="tu-input"
              value={name}
              maxLength={MAX_UNIT_NAME}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              placeholder="e.g. rpm"
              aria-label="Unit"
              autoFocus
            />
            <input
              className="tu-input"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              placeholder="Group, e.g. Speed"
              aria-label="Group"
              list="unit-groups"
            />
            <datalist id="unit-groups">
              {groups.map((g) => <option key={g} value={g} />)}
            </datalist>
            <button type="button" className="tu-btn-primary tu-btn-sm" onClick={add} disabled={busy || !name.trim()}>
              Add
            </button>
          </div>
          <p className="tu-unit-hint">
            Each unit has one spelling — &ldquo;kVA&rdquo; can&apos;t be added again as &ldquo;KVA&rdquo;. Leave the group empty to file it under Other.
          </p>
          {error && <p role="alert" className="tu-unit-error">{error}</p>}

          <div className="tu-unit-list">
            {groupUnits(units).map((g) => (
              <div key={g.group}>
                <p className="tu-unit-group">{g.group}</p>
                <ul role="list">
                  {g.units.map((u) => (
                    <li key={u.id} className="tu-unit-row">
                      <span>{u.name}</span>
                      {canRemove && (
                        u.inUse ? (
                          <span className="tu-unit-inuse">In use</span>
                        ) : (
                          <button type="button" className="tu-link" onClick={() => remove(u)} disabled={busy}>
                            Remove
                          </button>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
