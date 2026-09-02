"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

type Account = { id: string; name: string };

export type LoginTarget = {
  id: string;
  name: string;
  position: string | null;
  accounts: Account[];
};

/**
 * Gives someone on the roster a technician login.
 *
 * Deliberately not a role picker. This is reached from an employee's row, so
 * the person is already chosen and the role is the only one that can apply —
 * TECHNICIAN is the sole role that links to an Employee, and the API refuses
 * the pairing for any other. That leaves two fields to ask for.
 *
 * The accounts are shown rather than asked for: the backend derives them from
 * where this employee already works, narrowed to what the creator can reach
 * (accountsForNewTechnician in backend/routes/userRoutes.js). Showing the list
 * is what makes that derivation checkable — a reliever who works three sites
 * but whose login will only cover one is exactly the case someone needs to see
 * before they click.
 */
export default function GiveLoginModal({
  employee,
  onClose,
  onCreated,
}: {
  employee: LoginTarget;
  onClose: () => void;
  onCreated: (employeeId: string) => void;
}) {
  const noAccounts = employee.accounts.length === 0;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (noAccounts) {
      setError("Assign this employee to an account before giving them a login.");
      return;
    }
    if (!email.trim()) { setError("An email address is required."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }

    setError("");
    setSaving(true);
    try {
      await api.post("/users", {
        name: employee.name,
        email: email.trim(),
        password,
        role: "TECHNICIAN",
        employeeId: employee.id,
      });
      onCreated(employee.id);
      onClose();
    } catch (err: unknown) {
      // The API's own message is better than anything generic this form could
      // write: it distinguishes an address already in use from an employee who
      // already holds a login from one on an account this user cannot reach.
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "Could not create the login.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Give ${employee.name} a login`}
    >
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-md bg-[var(--tu-bg-surface)] rounded-xl shadow-2xl border border-[var(--tu-border)] flex flex-col">
        <div className="px-6 py-4 border-b border-[var(--tu-border)] flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold text-[var(--tu-text-heading)]">Give login</h3>
          <button
            onClick={onClose}
            className="text-[var(--tu-text-subtle)] hover:text-[var(--tu-text-body)] cursor-pointer text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4 flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--tu-text-heading)]">{employee.name}</p>
            <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
              {employee.position ?? "No position recorded"} · signs in as a technician
            </p>
          </div>

          <div>
            <label className="tu-label" htmlFor="give-login-email">Email *</label>
            <input
              id="give-login-email"
              className="tu-input"
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label className="tu-label" htmlFor="give-login-password">Password *</label>
            <input
              id="give-login-password"
              className="tu-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
            <p className="text-[11px] text-[var(--tu-text-subtle)] mt-1">
              They can be given a new one later from the Users page.
            </p>
          </div>

          <div className="border-t border-[var(--tu-border)] pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--tu-text-subtle)]">
              Will see work on
            </p>
            {noAccounts ? (
              // Blocked, not just warned. The API refuses this too, but only
              // just: sharesAccountWithEmployee waves a GENERAL_MANAGER through
              // regardless, so for them the guard is the membership check
              // rather than the employee check — and a login created past it
              // would have flipped the row to "Has login" and taken away the
              // only button that could retry.
              <p className="text-xs text-[var(--tu-on-warning)] mt-1">
                This employee isn&apos;t assigned to any of your accounts yet. Assign them first,
                or the login will have nothing to show.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {employee.accounts.map((a) => (
                  <span
                    key={a.id}
                    className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--tu-soft-accent)] text-[var(--tu-on-accent)]"
                  >
                    {a.name}
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-[var(--tu-text-subtle)] mt-2">
              Technicians see only the work orders assigned to them, and never cost.
            </p>
          </div>

          {error && <p className="text-[var(--tu-on-danger)] text-xs" role="alert">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-[var(--tu-border)] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="tu-btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={submit} className="tu-btn-primary" disabled={saving || noAccounts}>
            {saving ? "Creating…" : "Create login"}
          </button>
        </div>
      </div>
    </div>
  );
}
