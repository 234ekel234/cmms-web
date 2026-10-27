"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useConfirm } from "@/components/ConfirmDialog";

/**
 * Where you are signed in, from GET /me/sessions (backend helpers/sessions.js).
 * Signing a device out ends its token on the server, so a lost phone or a
 * shared computer is dealt with here rather than by changing the password.
 */
type Session = {
  id: string;
  device: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
};

/** "Active now", "2 hours ago", "3 days ago" — lastUsedAt moves every few minutes. */
function lastActive(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 10) return "Active now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function signedIn(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** `refreshKey` changes when something elsewhere ends sessions — a password change. */
export default function SignedInDevices({ refreshKey }: { refreshKey?: unknown }) {
  const { logout } = useAuth();
  const confirm = useConfirm();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/me/sessions")
      .then((res) => { if (!cancelled) setSessions(res.data); })
      .catch(() => { if (!cancelled) setError("Could not load your devices."); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  async function endOne(s: Session) {
    if (s.current) return logout();
    setBusy(s.id);
    setError("");
    try {
      await api.delete(`/me/sessions/${s.id}`);
      setSessions((prev) => prev?.filter((x) => x.id !== s.id) ?? null);
    } catch (err: unknown) {
      const r = (err as { response?: { data?: { error?: string } } })?.response;
      setError(r?.data?.error ?? "Could not sign that device out.");
    } finally {
      setBusy(null);
    }
  }

  async function endOthers() {
    if (!(await confirm({
      title: "Sign out everywhere else?",
      message: "Every other browser and phone signed in as you will need to sign in again. This one stays signed in.",
      confirmLabel: "Sign out others",
    }))) return;
    setBusy("others");
    setError("");
    try {
      await api.post("/me/sessions/end-others");
      setSessions((prev) => prev?.filter((x) => x.current) ?? null);
    } catch (err: unknown) {
      const r = (err as { response?: { data?: { error?: string } } })?.response;
      setError(r?.data?.error ?? "Could not sign your other devices out.");
    } finally {
      setBusy(null);
    }
  }

  const others = sessions?.filter((s) => !s.current).length ?? 0;

  return (
    <div style={{ padding: "0 24px 24px" }}>
      <p style={{ fontSize: 14, color: "var(--tu-text-body)", marginBottom: 16 }}>
        Signing a device out ends it straight away. Devices unused for 30 days sign out on their own.
      </p>
      {error && <p className="tu-danger-text" role="alert" style={{ fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {sessions === null && !error ? (
        <div className="tu-skeleton" style={{ height: 56, borderRadius: 8 }} />
      ) : sessions && sessions.length === 0 ? (
        // Signed in on a token from before sessions existed: nothing to list
        // until the next sign-in.
        <p style={{ fontSize: 13, color: "var(--tu-text-subtle)" }}>
          Your devices will appear here after you next sign in.
        </p>
      ) : (
        <ul role="list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sessions?.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3"
              style={{ border: "1px solid var(--tu-border)", borderRadius: 8, padding: "10px 14px" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--tu-text-heading)" }}>
                  {s.device ?? "Unknown device"}
                  {s.current && (
                    <span className="tu-chip" style={{ marginLeft: 8, fontSize: 11 }}>This device</span>
                  )}
                </p>
                <p style={{ fontSize: 12, color: "var(--tu-text-subtle)", marginTop: 2 }}>
                  {s.current ? "Active now" : lastActive(s.lastUsedAt)} · signed in {signedIn(s.createdAt)}
                </p>
              </div>
              <button
                type="button"
                className="tu-btn-secondary tu-btn-sm"
                onClick={() => endOne(s)}
                disabled={busy !== null}
              >
                {busy === s.id ? "Signing out…" : "Sign out"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {others > 0 && (
        <button
          type="button"
          className="tu-btn-secondary tu-btn-sm"
          style={{ marginTop: 14 }}
          onClick={endOthers}
          disabled={busy !== null}
        >
          {busy === "others" ? "Signing out…" : `Sign out everywhere else (${others})`}
        </button>
      )}
    </div>
  );
}
