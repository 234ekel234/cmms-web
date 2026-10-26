"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { isAxiosError } from "axios";
import api from "@/lib/api";

const INVALID = "This reset link has expired or has already been used. Ask for a new one.";

/**
 * Where the emailed link lands: `/reset-password?token=…`. The link is checked
 * first, so an expired one says so before anyone types a password twice. The
 * token is then taken out of the address bar — it is a key to the account for
 * the next hour, and the browser's history is not a safe place to keep it.
 * Success does not sign in; it sends the person to sign in with the password
 * they have just chosen, which every other session has now lost.
 */
function ResetPasswordForm() {
  const params = useSearchParams();
  // Read once: the address bar is cleaned below, and the token must survive that.
  const [token] = useState(() => params.get("token") ?? "");
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "done">(token ? "checking" : "invalid");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    window.history.replaceState(null, "", "/reset-password");
    let cancelled = false;
    api.post("/auth/reset-password/check", { token })
      .then(() => { if (!cancelled) setState("ready"); })
      .catch(() => { if (!cancelled) setState("invalid"); });
    return () => { cancelled = true; };
  }, [token]);

  const mismatch = confirm !== "" && password !== confirm;
  const canSubmit = password.length >= 6 && password === confirm && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", { token, password });
      setState("done");
    } catch (err) {
      const message = isAxiosError(err) ? err.response?.data?.error : null;
      if (message === INVALID) setState("invalid");
      else setError(message || "Couldn't reset your password. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") return <p className="tu-login-lead">Checking your link…</p>;

  if (state === "invalid") {
    return (
      <>
        <p className="tu-login-lead">{INVALID}</p>
        <Link href="/forgot-password" className="tu-login-submit" style={{ display: "block", textAlign: "center" }}>Send a new link</Link>
      </>
    );
  }

  if (state === "done") {
    return (
      <>
        <p className="tu-login-lead">Your password has been changed, and you&apos;ve been signed out everywhere else. Sign in with the new one.</p>
        <Link href="/login" className="tu-login-submit" style={{ display: "block", textAlign: "center" }}>Sign in</Link>
      </>
    );
  }

  return (
    <>
      <p className="tu-login-lead">Choose a new password for your account.</p>
      {error && <div className="tu-login-error" role="alert">{error}</div>}
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div>
          <label className="tu-login-label" htmlFor="reset-new">New password</label>
          <input id="reset-new" type="password" className="tu-login-input" autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" maxLength={72} disabled={busy} />
        </div>
        <div>
          <label className="tu-login-label" htmlFor="reset-confirm">Confirm new password</label>
          <input id="reset-confirm" type="password" className="tu-login-input" autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={72} disabled={busy} />
          {mismatch && <p className="text-xs text-[var(--tu-on-danger)] mt-1">The two passwords don&apos;t match</p>}
        </div>
        <button type="submit" disabled={!canSubmit} className="tu-login-submit">
          {busy ? "Saving…" : "Set new password"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="tu-login">
      <div className="tu-login-form-panel" style={{ flex: 1 }}>
        <div className="tu-login-form">
          <h1 className="tu-login-title">Reset your password</h1>
          <Suspense fallback={<p className="tu-login-lead">Checking your link…</p>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
