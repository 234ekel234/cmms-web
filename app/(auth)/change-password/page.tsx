"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import PasswordChangeForm from "@/components/PasswordChangeForm";
import { clearSession, type User } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/rbac";

/**
 * The first thing a new login sees, and the first thing after a reset: the
 * password was chosen by somebody else, so it is replaced before anything else.
 * Outside the dashboard shell on purpose — the shell loads notifications and
 * accounts, which the API refuses until this is done.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  // The stored session, read without a render-time effect. The raw string is
  // the snapshot (a parsed object would be new on every read); null on the
  // server, where there is no session to read.
  const raw = useSyncExternalStore(
    () => () => {},
    () => localStorage.getItem("user"),
    () => null,
  );
  const user = useMemo<User | null>(() => {
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }, [raw]);
  const signedIn = typeof window === "undefined" || localStorage.getItem("token") != null;

  useEffect(() => {
    if (!signedIn) router.replace("/login");
  }, [signedIn, router]);

  if (!user) return null;

  return (
    <div className="tu-login">
      <div className="tu-login-form-panel" style={{ flex: 1 }}>
        <div className="tu-login-form">
          <h1 className="tu-login-title">Choose a new password</h1>
          <p className="tu-login-lead">
            Hi {user.name.split(" ")[0]} — the password you signed in with was set for you. Choose your own to continue.
          </p>
          <PasswordChangeForm
            submitLabel="Save and continue"
            onDone={(u) => router.replace(ROLE_HOME[u.role])}
          />
          <button
            type="button"
            className="tu-btn-ghost tu-btn-sm"
            style={{ marginTop: 24 }}
            onClick={() => { clearSession(); router.replace("/login"); }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
