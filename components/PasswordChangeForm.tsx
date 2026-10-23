"use client";

import { useState } from "react";
import api from "@/lib/api";
import { saveSession, type User } from "@/lib/auth";

/**
 * Changing your own password: the current one, the new one twice.
 *
 * The API ends every other session on success and hands back a token for this
 * one, which is saved here — keeping the old token would sign this browser out
 * on its next request.
 */
export default function PasswordChangeForm({ onDone, submitLabel = "Change password" }: {
  onDone: (user: User) => void;
  submitLabel?: string;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const mismatch = confirm !== "" && next !== confirm;
  const canSubmit = current !== "" && next.length >= 6 && next === confirm && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/me/password", { currentPassword: current, newPassword: next });
      saveSession(res.data.token, res.data.user);
      setCurrent(""); setNext(""); setConfirm("");
      onDone(res.data.user);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "Couldn't change your password. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" style={{ maxWidth: 360 }}>
      <div>
        <label className="tu-label" htmlFor="pw-current">Current password</label>
        <input id="pw-current" className="tu-input" type="password" autoComplete="current-password"
          value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div>
        <label className="tu-label" htmlFor="pw-new">New password</label>
        <input id="pw-new" className="tu-input" type="password" autoComplete="new-password"
          value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 6 characters" maxLength={72} />
      </div>
      <div>
        <label className="tu-label" htmlFor="pw-confirm">Confirm new password</label>
        <input id="pw-confirm" className="tu-input" type="password" autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={72}
          aria-invalid={mismatch} aria-describedby={mismatch ? "pw-mismatch" : undefined} />
        {mismatch && <p id="pw-mismatch" className="tu-field-error">The passwords don&apos;t match.</p>}
      </div>
      {error && <p role="alert" className="tu-field-error">{error}</p>}
      <div>
        <button type="submit" className="tu-btn-primary" disabled={!canSubmit}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
