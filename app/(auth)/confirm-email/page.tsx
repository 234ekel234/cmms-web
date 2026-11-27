"use client";

import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { isAxiosError } from "axios";
import api from "@/lib/api";
import { clearSession, getToken, getUser, saveSession, type User } from "@/lib/auth";
import { clearPendingConfirm, pendingConfirm, savePendingConfirm } from "@/lib/emailConfirm";
import { ROLE_HOME } from "@/lib/rbac";

// True once in the browser: the session and the pending token live in browser
// storage, which the server render cannot read.
const subscribeNever = () => () => {};
const useInBrowser = () => useSyncExternalStore(subscribeNever, () => true, () => false);

/**
 * Where the confirm-your-email link lands. Confirming needs a signed-in user —
 * the one the link was sent for — so a stranger who received it at a mistyped
 * address cannot confirm it, and nor can the link scanners in mail filters,
 * which open every link they see. So the page never confirms on load. Signed
 * out, it asks for the password right here and confirms the moment sign-in
 * succeeds — typing the password is the proof a scanner cannot give, so a
 * second click would only be in the way. Signed in, one click confirms. The
 * token waits in lib/emailConfirm.ts meanwhile.
 */
function ConfirmEmail() {
  const router = useRouter();
  const params = useSearchParams();
  const [token] = useState(() => params.get("token") ?? "");
  const inBrowser = useInBrowser();
  const [state, setState] = useState<"ask" | "done" | "wrong-user" | "invalid">("ask");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Out of the address bar and history, and kept for the trip through sign-in.
  useEffect(() => {
    if (!token) return;
    savePendingConfirm(token);
    window.history.replaceState(null, "", "/confirm-email");
  }, [token]);

  const pending = inBrowser ? token || pendingConfirm() : null;
  const user: User | null = inBrowser && getToken() ? getUser() : null;

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    await confirmToken();
    setBusy(false);
  }

  async function signInAndConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!pending || !email.trim() || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post("/auth/login", { email: email.trim().toLowerCase(), password });
      saveSession(res.data.token, res.data.user);
    } catch (err) {
      setError((isAxiosError(err) && err.response?.data?.error) || "Incorrect email or password.");
      setBusy(false);
      return;
    }
    // Allowed before a forced password change; the done screen sends on to it.
    await confirmToken();
    setBusy(false);
  }

  async function confirmToken() {
    try {
      await api.post("/me/confirm-email", { token: pending });
      clearPendingConfirm();
      setState("done");
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      const message = isAxiosError(err) ? err.response?.data?.error : null;
      if (status === 403) setState("wrong-user");
      else if (status === 400) { clearPendingConfirm(); setState("invalid"); setError(message ?? null); }
      else setError(message || "Couldn't confirm your email. Try again.");
    }
  }

  function signInAsSomeoneElse() {
    clearSession();
    router.push("/login");
  }

  if (!inBrowser) return null;

  if (!pending && state === "ask") {
    return (
      <>
        <p className="tu-login-lead">Open the confirm link from your email to confirm your address.</p>
        <Link href="/login" className="tu-login-submit" style={{ display: "block", textAlign: "center" }}>Sign in</Link>
      </>
    );
  }

  if (state === "done") {
    const next = user?.mustChangePassword ? "/change-password" : user ? ROLE_HOME[user.role] : "/login";
    return (
      <>
        <p className="tu-login-lead">Your email is confirmed. Work updates will keep reaching {user?.email ?? "you"}.</p>
        <Link href={next} className="tu-login-submit" style={{ display: "block", textAlign: "center" }}>
          {user?.mustChangePassword ? "Choose your password" : "Continue to FMI HANNI"}
        </Link>
      </>
    );
  }

  if (state === "invalid") {
    return (
      <>
        <p className="tu-login-lead">{error ?? "This confirm link has expired or has already been used."}</p>
        <Link href={user ? ROLE_HOME[user.role] : "/login"} className="tu-login-submit" style={{ display: "block", textAlign: "center" }}>
          {user ? "Go to FMI HANNI" : "Sign in"}
        </Link>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <p className="tu-login-lead">Sign in to confirm your email. It&apos;s how we know the address really belongs to you.</p>
        {error && <div className="tu-login-error" role="alert">{error}</div>}
        <form onSubmit={signInAndConfirm} className="flex flex-col gap-5">
          <div>
            <label className="tu-login-label" htmlFor="confirm-email-address">Email</label>
            <input
              id="confirm-email-address"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
              placeholder="name@example.com"
              autoComplete="email"
              autoFocus
              disabled={busy}
              className="tu-login-input"
            />
          </div>
          <div>
            <label className="tu-login-label" htmlFor="confirm-email-password">Password</label>
            <div className="relative">
              <input
                id="confirm-email-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={busy}
                className="tu-login-input"
                style={{ paddingRight: 64 }}
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="tu-login-reveal">
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <div className="flex justify-end mt-2">
              <Link href="/forgot-password" className="text-xs font-semibold text-[var(--tu-text-brand)] hover:underline">
                Forgot password?
              </Link>
            </div>
          </div>
          <button type="submit" className="tu-login-submit" disabled={busy || !email.trim() || !password}>
            {busy ? "Confirming…" : "Sign in and confirm"}
          </button>
        </form>
      </>
    );
  }

  if (state === "wrong-user") {
    return (
      <>
        <p className="tu-login-lead">
          This link was sent for a different login than {user.email}. Sign out, then sign in as the person it was sent to.
        </p>
        <button type="button" className="tu-login-submit" onClick={signInAsSomeoneElse}>Sign out and sign in again</button>
      </>
    );
  }

  return (
    <>
      <p className="tu-login-lead">Confirm that <strong>{user.email}</strong> is your email address.</p>
      {error && <div className="tu-login-error" role="alert">{error}</div>}
      <button type="button" className="tu-login-submit" onClick={confirm} disabled={busy}>
        {busy ? "Confirming…" : "Confirm my email"}
      </button>
      <p className="tu-login-lead" style={{ marginTop: 16, fontSize: 13 }}>
        Not {user.name}? <button type="button" onClick={signInAsSomeoneElse} style={{ textDecoration: "underline" }}>Sign in as someone else</button>
      </p>
    </>
  );
}

export default function ConfirmEmailPage() {
  return (
    <div className="tu-login">
      <div className="tu-login-form-panel" style={{ flex: 1 }}>
        <div className="tu-login-form">
          <h1 className="tu-login-title">Confirm your email</h1>
          <Suspense fallback={null}>
            <ConfirmEmail />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
