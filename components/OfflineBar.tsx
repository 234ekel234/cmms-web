"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OFFLINE_DATA_EVENT, ONLINE_DATA_EVENT } from "@/lib/offlineData";
import { listOutbox, OUTBOX_EVENT, type OutboxRound } from "@/lib/offlineOutbox";
import { useAuth } from "@/context/AuthContext";
import { startLoad } from "@/lib/startLoad";

/**
 * "You're offline", under the top bar, whenever there is no signal or the page
 * is showing a copy saved on this device (lib/offlineData.ts). It says how old
 * that copy is, because a job list from yesterday afternoon and one from five
 * minutes ago call for different trust — and that changes need a connection,
 * so nobody fills in a form believing it saved.
 *
 * Goes away by itself once a request reaches the server again.
 */
export default function OfflineBar() {
  const { user } = useAuth();
  const [offline, setOffline] = useState(false);
  // Rounds saved on this phone and not sent yet (lib/offlineOutbox.ts).
  const [outbox, setOutbox] = useState<OutboxRound[]>([]);
  const loadOutbox = useCallback(async (isCancelled?: () => boolean) => {
    if (!user) return;
    const rows = await listOutbox(user.id);
    if (!isCancelled?.()) setOutbox(rows);
  }, [user]);
  useEffect(() => {
    const stop = startLoad(loadOutbox);
    const onChange = () => { void loadOutbox(); };
    window.addEventListener(OUTBOX_EVENT, onChange);
    return () => { stop(); window.removeEventListener(OUTBOX_EVENT, onChange); };
  }, [loadOutbox]);
  // The oldest saved copy shown since going offline: the page is only as fresh
  // as its stalest part.
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => { setOffline(false); setSavedAt(null); };
    const usedCopy = (e: Event) => {
      const at = (e as CustomEvent<{ savedAt: number | null }>).detail?.savedAt ?? null;
      setOffline(true);
      if (at) setSavedAt((prev) => (prev == null ? at : Math.min(prev, at)));
    };
    const reached = () => { if (navigator.onLine) goOnline(); };

    queueMicrotask(() => { if (!navigator.onLine) setOffline(true); });
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", reached);
    window.addEventListener(OFFLINE_DATA_EVENT, usedCopy);
    window.addEventListener(ONLINE_DATA_EVENT, reached);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", reached);
      window.removeEventListener(OFFLINE_DATA_EVENT, usedCopy);
      window.removeEventListener(ONLINE_DATA_EVENT, reached);
    };
  }, []);

  const waiting = outbox.filter((r) => r.status === "waiting");
  const failed = outbox.filter((r) => r.status === "failed");
  if (!offline && !outbox.length) return null;

  const when = savedAt
    ? new Date(savedAt).toLocaleString("en-GB", {
        hour: "2-digit", minute: "2-digit",
        ...(new Date(savedAt).toDateString() === new Date().toDateString() ? {} : { weekday: "short", day: "numeric", month: "short" }),
      })
    : null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "10px 16px", fontSize: 13, lineHeight: 1.4,
        background: "var(--tu-soft-warning)", color: "var(--tu-on-warning)",
        borderBottom: "1px solid var(--tu-bd-warning)",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M12 20h.01" />
      </svg>
      <span style={{ flex: "1 1 260px" }}>
        {offline && (
          <>
            <strong>You&apos;re offline.</strong>{" "}
            {when ? <>Showing what was saved on this device at {when}.</> : <>Pages you opened before still work.</>}{" "}
            Checklist rounds save on this phone; other changes need a connection.{" "}
          </>
        )}
        {waiting.length > 0 && (
          <>{waiting.length} round{waiting.length === 1 ? "" : "s"} waiting to send{offline ? "" : ", sending now"}.{" "}</>
        )}
        {failed.map((r) => (
          <span key={r.id} style={{ display: "block", marginTop: 4 }}>
            <strong>Couldn&apos;t send {r.checklistName}.</strong>{" "}
            <Link href={`/accounts/${r.accountId}/checklists/${r.assignmentId}?period=${r.periodStart}`} style={{ color: "inherit", fontWeight: 600, textDecoration: "underline" }}>Open it</Link>
          </span>
        ))}
      </span>
    </div>
  );
}
