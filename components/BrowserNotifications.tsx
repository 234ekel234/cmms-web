"use client";

import { useCallback, useEffect, useState } from "react";
import Switch from "@/components/Switch";
import { errorMessage } from "@/lib/api";
import { startLoad } from "@/lib/startLoad";
import { getPushState, sendTestPush, turnOffPush, turnOnPush, type PushState } from "@/lib/webPush";

/**
 * Settings → Notifications on this device: the browser's own notifications
 * (lib/webPush.ts). Which events notify you is the preference list below it —
 * these ride the same "In app" switches as the phone app's push.
 *
 * Hidden entirely when the server has no keys set, since there is nothing to
 * turn on.
 */
export default function BrowserNotifications({ userId }: { userId: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (isCancelled?: () => boolean) => {
    try {
      const s = await getPushState(userId);
      if (!isCancelled?.()) setState(s);
    } catch {
      if (!isCancelled?.()) setState("unavailable");
    }
  }, [userId]);

  useEffect(() => startLoad(load), [load]);

  async function toggle() {
    setBusy(true);
    setMessage(null);
    try {
      if (state === "on") {
        await turnOffPush();
        setMessage({ ok: true, text: "Notifications are off on this device." });
      } else {
        await turnOnPush(userId);
        setMessage({ ok: true, text: "Notifications are on. Try “Send a test”." });
      }
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error && !("isAxiosError" in err) ? err.message : errorMessage(err, "Could not change notifications.") });
    } finally {
      await load();
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      await sendTestPush();
      setMessage({ ok: true, text: "Sent. It should appear in a few seconds." });
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err, "Could not send a test notification.") });
    } finally {
      setBusy(false);
    }
  }

  if (state === null || state === "unavailable") return null;

  return (
    <div className="tu-card" style={{ marginBottom: 24 }}>
      <div className="tu-card-header">
        <h2 className="tu-card-title">Notifications on this device</h2>
      </div>
      <div className="tu-card-pad">
        {state === "unsupported" && (
          <p className="tu-card-intro" style={{ margin: 0 }}>
            This browser can&apos;t show notifications. Chrome, Edge, Firefox and Safari can.
          </p>
        )}

        {state === "needs-install" && (
          <p className="tu-card-intro" style={{ margin: 0 }}>
            On iPhone and iPad, notifications work from the Home Screen app. In Safari, tap
            Share → <strong>Add to Home Screen</strong>, open HANNI from the new icon, and turn
            this on there.
          </p>
        )}

        {state === "denied" && (
          <p className="tu-card-intro" style={{ margin: 0 }}>
            Notifications are blocked for this site. Allow them in your browser&apos;s site
            settings (the icon beside the address), then reload this page.
          </p>
        )}

        {(state === "on" || state === "off") && (
          <>
            <p className="tu-card-intro">
              Get a notification on this computer or phone when something needs you, even when
              HANNI isn&apos;t open. Which events notify you is set in the list below.
            </p>
            <div className="tu-page-actions" style={{ alignItems: "center", gap: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, fontWeight: 600, color: "var(--tu-text-heading)" }}>
                <Switch on={state === "on"} onToggle={busy ? () => {} : toggle} label="Notifications on this device" />
                {state === "on" ? "On" : "Off"}
              </label>
              {state === "on" && (
                <button type="button" className="tu-btn-secondary" onClick={test} disabled={busy}>
                  Send a test
                </button>
              )}
            </div>
          </>
        )}

        {message && (
          <p role="status" style={{ margin: "12px 0 0", fontSize: 13, fontWeight: 600, color: message.ok ? "var(--tu-on-success)" : "var(--tu-on-danger)" }}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
