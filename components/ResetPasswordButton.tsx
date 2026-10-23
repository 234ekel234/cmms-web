"use client";

import { useState } from "react";
import api from "@/lib/api";

/**
 * Setting a new password for someone who has lost theirs. The person resetting
 * it hands it over in person; they choose their own the next time they sign
 * in, and every session they had is ended now. Offered only where
 * `canResetPassword` says so — the API makes the same check and more (the
 * person must be on one of your sites).
 */
export default function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6 || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/users/${userId}/reset-password`, { newPassword: pw });
      setDone(true);
      setOpen(false);
      setPw("");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "Couldn't reset the password.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="tu-reset-pw">
        <button type="button" className="tu-btn-secondary tu-btn-sm" onClick={() => { setOpen(true); setDone(false); }}>
          Reset password
        </button>
        {done && (
          <p className="tu-reset-pw-note" role="status">
            Password reset. Give it to {name} in person — they&apos;ll choose their own when they sign in,
            and they&apos;ve been signed out everywhere.
          </p>
        )}
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="tu-reset-pw">
      <label className="tu-label" htmlFor={`reset-${userId}`}>New password for {name}</label>
      <div className="tu-reset-pw-row">
        <input id={`reset-${userId}`} className="tu-input" type="text" autoComplete="off" autoFocus
          value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 6 characters" maxLength={72} />
        <button type="submit" className="tu-btn-primary tu-btn-sm" disabled={pw.length < 6 || busy}>
          {busy ? "Saving…" : "Reset"}
        </button>
        <button type="button" className="tu-btn-ghost tu-btn-sm" onClick={() => { setOpen(false); setPw(""); setError(""); }}>
          Cancel
        </button>
      </div>
      <p className="tu-reset-pw-note">They&apos;ll be signed out and asked to choose their own at their next sign-in.</p>
      {error && <p role="alert" className="tu-field-error">{error}</p>}
    </form>
  );
}
