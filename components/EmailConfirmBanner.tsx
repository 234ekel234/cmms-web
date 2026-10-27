"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

type Me = {
  email: string;
  emailVerifiedAt: string | null;
  emailConfirmRequestedAt: string | null;
  emailPaused: boolean;
  emailPausesAt: string | null;
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });

/**
 * "Confirm your email address", above every page until it is done.
 *
 * Read from `GET /me` rather than the session saved at sign-in, which cannot
 * know about a confirmation made since on another device. Once confirmed it
 * draws nothing. The three states it says apart: no link sent yet, a link out
 * with the date emails will pause, and emails already paused
 * (backend helpers/emailConfirmation.js).
 */
export default function EmailConfirmBanner() {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Me>("/me").then((res) => { if (!cancelled) setMe(res.data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!me || me.emailVerifiedAt) return null;

  async function resend() {
    setBusy(true);
    setNote(null);
    try {
      const res = await api.post<{ sent: boolean }>("/me/confirm-email/resend");
      setNote(res.data.sent ? `Sent to ${me!.email} — check the inbox, and the junk folder.` : "Couldn't send it just now. Try again later.");
      if (!me!.emailConfirmRequestedAt) setMe({ ...me!, emailConfirmRequestedAt: new Date().toISOString() });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setNote(e?.response?.data?.error ?? "Couldn't send it just now. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  const message = me.emailPaused
    ? <>Emails to <strong>{me.email}</strong> are paused until you confirm it&apos;s your address.</>
    : me.emailConfirmRequestedAt
      ? <>Confirm <strong>{me.email}</strong> is your address — we sent you a link.{me.emailPausesAt ? <> Until you do, emails stop on {fmt(me.emailPausesAt)}.</> : null}</>
      : <>Confirm <strong>{me.email}</strong> is your email address, so work updates keep reaching you.</>;

  return (
    <div
      role="status"
      style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "10px 16px", fontSize: 13, lineHeight: 1.4,
        background: "var(--tu-soft-warning)", color: "var(--tu-on-warning)",
        borderBottom: "1px solid var(--tu-bd-warning)",
      }}
    >
      <span style={{ flex: "1 1 280px" }}>{message}{note ? <> <em style={{ fontStyle: "normal", fontWeight: 600 }}>{note}</em></> : null}</span>
      <button type="button" className="tu-btn-secondary tu-btn-sm" onClick={resend} disabled={busy}>
        {busy ? "Sending…" : me.emailConfirmRequestedAt ? "Send the link again" : "Send me the link"}
      </button>
    </div>
  );
}
