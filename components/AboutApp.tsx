"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { startLoad } from "@/lib/startLoad";

/**
 * Settings → About this app: which build of the web and of the API this is.
 * The first question when someone reports a problem, and the way to confirm a
 * deploy landed. The web's commit is stamped at build time (next.config.ts);
 * the API reports its own (GET /system/version, backend helpers/version.js).
 */
const WEB_COMMIT = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "unknown";
const WEB_BUILT_AT = process.env.NEXT_PUBLIC_BUILT_AT ?? null;

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "unknown";

export default function AboutApp() {
  const [apiVersion, setApiVersion] = useState<{ commit: string | null; startedAt: string } | null>(null);
  const [apiFailed, setApiFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (isCancelled?: () => boolean) => {
    try {
      const res = await api.get("/system/version");
      if (!isCancelled?.()) setApiVersion(res.data);
    } catch {
      if (!isCancelled?.()) setApiFailed(true);
    }
  }, []);
  useEffect(() => startLoad(load), [load]);

  const apiLine = apiVersion ? `${apiVersion.commit ?? "unknown"} (running since ${when(apiVersion.startedAt)})` : apiFailed ? "couldn't be reached" : "…";
  const summary = `FMI HANNI · Web ${WEB_COMMIT} (built ${when(WEB_BUILT_AT)}) · API ${apiLine}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the text is on screen to read out */ }
  }

  return (
    <div className="tu-card" style={{ marginBottom: 24 }}>
      <div className="tu-card-header">
        <h2 className="tu-card-title">About this app</h2>
      </div>
      <div className="tu-card-pad">
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "8px 16px", margin: 0, fontSize: 14 }}>
          <dt style={{ color: "var(--tu-text-subtle)" }}>Web</dt>
          <dd style={{ margin: 0 }}>
            <span className="tu-figure" style={{ fontWeight: 600, color: "var(--tu-text-heading)" }}>{WEB_COMMIT}</span>
            <span style={{ color: "var(--tu-text-body)" }}> · built {when(WEB_BUILT_AT)}</span>
          </dd>
          <dt style={{ color: "var(--tu-text-subtle)" }}>API</dt>
          <dd style={{ margin: 0 }}>
            {apiVersion ? (
              <>
                <span className="tu-figure" style={{ fontWeight: 600, color: "var(--tu-text-heading)" }}>{apiVersion.commit ?? "unknown"}</span>
                <span style={{ color: "var(--tu-text-body)" }}> · running since {when(apiVersion.startedAt)}</span>
              </>
            ) : (
              <span style={{ color: "var(--tu-text-subtle)" }}>{apiFailed ? "Couldn't be reached" : "Checking…"}</span>
            )}
          </dd>
        </dl>
        <p className="tu-card-intro" style={{ margin: "12px 0 0" }}>
          Quote these when reporting a problem.{" "}
          <button type="button" className="tu-btn-secondary tu-btn-sm" onClick={copy} style={{ marginLeft: 4 }}>
            {copied ? "Copied" : "Copy"}
          </button>
        </p>
      </div>
    </div>
  );
}
