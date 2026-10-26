"use client";

import { useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import api from "@/lib/api";

/**
 * Asking for a reset link. The API answers the same whether or not the address
 * has a login, so this page does too: it never says "no such user". It also
 * says what to do if nothing arrives — until the mailer is switched on, and
 * whenever it stops, a manager's reset is the way back in.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post("/auth/forgot-password", { email: email.trim().toLowerCase() });
      setSent(res.data.message);
    } catch (err) {
      setError((isAxiosError(err) && err.response?.data?.error) || "Something went wrong. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tu-login">
      <div className="tu-login-form-panel" style={{ flex: 1 }}>
        <div className="tu-login-form">
          <h1 className="tu-login-title">Forgot your password?</h1>
          {sent ? (
            <>
              <p className="tu-login-lead">{sent}</p>
              <p className="tu-login-lead">
                Nothing in a few minutes? Check your junk folder, or ask your manager to reset your password for you.
              </p>
            </>
          ) : (
            <>
              <p className="tu-login-lead">Enter the email address you sign in with, and we&apos;ll send you a link to choose a new password.</p>
              {error && <div className="tu-login-error" role="alert">{error}</div>}
              <form onSubmit={submit} className="flex flex-col gap-5">
                <div>
                  <label className="tu-login-label" htmlFor="forgot-email">Email</label>
                  <input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                    placeholder="name@example.com"
                    autoComplete="email"
                    disabled={busy}
                    className="tu-login-input"
                  />
                </div>
                <button type="submit" disabled={!email.trim() || busy} className="tu-login-submit">
                  {busy ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </>
          )}
          <p style={{ marginTop: 24 }}>
            <Link href="/login" className="text-xs font-semibold text-[var(--tu-text-brand)] hover:underline">← Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
