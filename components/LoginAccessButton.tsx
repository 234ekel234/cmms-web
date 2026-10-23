"use client";

import { useState } from "react";
import api from "@/lib/api";
import { useConfirm } from "@/components/ConfirmDialog";

/**
 * Disable or re-enable a login. Disabling is for someone who has left: it ends
 * their sessions at once and refuses sign-in, and keeps everything they did.
 * Offered where `canResetPassword` says the caller may manage this login — the
 * API applies the same reach.
 */
export default function LoginAccessButton({ userId, name, disabledAt, onChange }: {
  userId: string;
  name: string;
  disabledAt: string | null | undefined;
  onChange: (disabledAt: string | null) => void;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    const disabling = !disabledAt;
    if (disabling && !(await confirm({
      title: `Disable ${name}'s login?`,
      message: `${name} will be signed out everywhere and won't be able to sign in. Their work and history stay as they are, and you can re-enable the login later.`,
      confirmLabel: "Disable login",
    }))) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/users/${userId}/${disabling ? "disable" : "enable"}`);
      onChange(disabling ? new Date().toISOString() : null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "Couldn't change the login.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tu-reset-pw">
      <div>
        <button
          type="button"
          className={disabledAt ? "tu-btn-secondary tu-btn-sm" : "tu-btn-ghost tu-btn-sm tu-text-danger"}
          onClick={toggle}
          disabled={busy}
        >
          {busy ? "Saving…" : disabledAt ? "Re-enable login" : "Disable login"}
        </button>
      </div>
      {error && <p role="alert" className="tu-field-error">{error}</p>}
    </div>
  );
}
