"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { isAxiosError } from "axios";
import api, { errorMessage } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { startLoad } from "@/lib/startLoad";

type Info =
  | { enabled: false }
  | { enabled: true; place: string; building: string | null; categories: { value: string; label: string }[] };

/**
 * Where a location sticker's QR code lands (`/r/<code>`), outside the signed-in
 * app on purpose.
 *
 * Signed in: straight on to the place's page, marked as a scan so the visit is
 * recorded. Signed out: a short report form when the site has opened reports to
 * the public — which says nothing about the site beyond the name of the place
 * the reporter is standing in — and a sign-in button either way.
 */
export default function StickerPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);

  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — never shown
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (getToken()) {
      try {
        const res = await api.get(`/locations/by-code/${code}`);
        router.replace(`/accounts/${res.data.accountId}/assets/locations/${res.data.locationId}?scan=1`);
        return;
      } catch (err) {
        // Not one of their sites: carry on as anyone else would.
        if (!(isAxiosError(err) && err.response?.status === 404)) return;
      }
    }
    try {
      const res = await api.get(`/public/report/${code}`);
      setInfo(res.data);
    } catch {
      setMissing(true);
    }
  }, [code, router]);
  useEffect(() => startLoad(load), [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) { setError("Choose what the problem is."); return; }
    setSending(true);
    setError(null);
    try {
      await api.post(`/public/report/${code}`, { category, note, contact, website });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the report. Please try again."));
    } finally {
      setSending(false);
    }
  }

  const signIn = `/login?next=${encodeURIComponent(`/r/${code}`)}`;

  return (
    <main className="min-h-screen bg-[var(--tu-bg-secondary)] flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-center gap-3">
          {/* eslint-disable @next/next/no-img-element */}
          <img src="/fmi_logo_dark.png" alt="FMI" className="h-8 w-auto" />
          <img src="/servicemaster_logo_hq.png" alt="ServiceMaster" className="h-6 w-auto" />
          {/* eslint-enable @next/next/no-img-element */}
        </div>

        <section className="tu-card tu-card-pad">
          {missing ? (
            <p className="text-sm text-[var(--tu-text-body)]">This sticker isn&apos;t recognised. It may have been replaced — please let the site team know.</p>
          ) : !info ? (
            <div className="tu-skeleton" style={{ height: 120 }} />
          ) : !info.enabled ? (
            <>
              <h1 className="tu-card-title mb-2">Location sticker</h1>
              <p className="text-sm text-[var(--tu-text-body)] mb-4">Sign in to see this place&apos;s work and checklists.</p>
              <Link href={signIn} className="tu-btn-primary inline-block">Sign in</Link>
            </>
          ) : sent ? (
            <>
              <h1 className="tu-card-title mb-2">Thank you</h1>
              <p className="text-sm text-[var(--tu-text-body)]">Your report about <strong>{info.place}</strong> has been sent to the maintenance team.</p>
              <button type="button" className="tu-link text-sm mt-4" onClick={() => { setSent(false); setCategory(""); setNote(""); }}>
                Report something else
              </button>
            </>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div>
                <h1 className="tu-card-title">Report a problem</h1>
                <p className="text-sm text-[var(--tu-text-subtle)]">{info.building ? `${info.building} · ` : ""}{info.place}</p>
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="tu-label mb-1">What&apos;s the problem?</legend>
                {info.categories.map((c) => (
                  <label
                    key={c.value}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm cursor-pointer ${
                      category === c.value ? "border-[var(--tu-text-brand)] bg-[var(--tu-soft-brand)]" : "border-[var(--tu-border)]"
                    }`}
                  >
                    <input type="radio" name="category" value={c.value} checked={category === c.value} onChange={() => setCategory(c.value)} />
                    {c.label}
                  </label>
                ))}
              </fieldset>
              <div>
                <label className="tu-label" htmlFor="r-note">Details {category === "OTHER" ? "" : "(optional)"}</label>
                <textarea id="r-note" className="tu-textarea" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div>
                <label className="tu-label" htmlFor="r-contact">Your name or number (optional)</label>
                <input id="r-contact" className="tu-input" maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} />
                <p className="text-xs text-[var(--tu-text-subtle)] mt-1">Only if you&apos;d like the team to follow up with you.</p>
              </div>
              {/* Hidden from people, filled in by bots. */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
                <label htmlFor="r-website">Website</label>
                <input id="r-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
              {error && <div className="tu-action-error" role="alert"><span>{error}</span></div>}
              <button type="submit" className="tu-btn-primary" disabled={sending}>{sending ? "Sending…" : "Send report"}</button>
            </form>
          )}
        </section>

        {info?.enabled && (
          <p className="text-center text-xs text-[var(--tu-text-subtle)]">
            Staff? <Link href={signIn} className="tu-link">Sign in</Link> to see this place&apos;s work.
          </p>
        )}
      </div>
    </main>
  );
}
