import api from "@/lib/api";

/**
 * Notifications on this device, through the browser (backend helpers/webPush.js,
 * public/sw.js). Settings → Notifications on this device turns it on and off;
 * AppShell calls `syncPush` on load; signing out calls `dropPush`.
 *
 * Browser permission belongs to the site, not to a person, so a subscription is
 * remembered against the user who made it (OWNER_KEY). If somebody else signs
 * in on the same browser, theirs is never switched on silently — the old one is
 * removed instead, and they turn their own on if they want it.
 */

const OWNER_KEY = "hanni.webpush.user";

export type PushState =
  | "unsupported"   // this browser cannot do web push
  | "needs-install" // iPhone / iPad: only from the Home Screen app
  | "unavailable"   // the server has no keys set
  | "denied"        // blocked in the browser's site settings
  | "off"
  | "on";

function readOwner(): string | null {
  try { return localStorage.getItem(OWNER_KEY); } catch { return null; }
}
function writeOwner(userId: string | null) {
  try {
    if (userId) localStorage.setItem(OWNER_KEY, userId);
    else localStorage.removeItem(OWNER_KEY);
  } catch { /* private window: the subscription still works this session */ }
}

export function pushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

/** iOS only offers web push to a site added to the Home Screen and opened from there. */
export function isIosBrowserTab(): boolean {
  if (typeof window === "undefined") return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

async function existingSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/** The VAPID public key as the bytes `subscribe` wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function serverKey(): Promise<string | null> {
  const { data } = await api.get<{ publicKey: string | null }>("/me/web-push");
  return data.publicKey;
}

export async function getPushState(userId: string): Promise<PushState> {
  if (isIosBrowserTab()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  if (!(await serverKey())) return "unavailable";
  if (Notification.permission === "denied") return "denied";
  const sub = await existingSubscription();
  return sub && readOwner() === userId && Notification.permission === "granted" ? "on" : "off";
}

/** Asks the browser, subscribes, and registers it with the API. Throws a readable error. */
export async function turnOnPush(userId: string): Promise<void> {
  const key = await serverKey();
  if (!key) throw new Error("Notifications are not set up on this server yet.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied"
      ? "Notifications are blocked for this site. Allow them in the browser's site settings, then try again."
      : "Notifications were not allowed.");
  }

  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const reg = await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another server key (the keys were changed) cannot
  // receive from this one; replace it.
  const current = sub?.options?.applicationServerKey;
  if (sub && current && btoaBytes(current) !== btoaBytes(keyBytes(key).buffer)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });

  await api.post("/me/web-push", { subscription: sub.toJSON() });
  writeOwner(userId);
}

function btoaBytes(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

/** Turns this browser's notifications off, here and on the server. */
export async function turnOffPush(): Promise<void> {
  const sub = await existingSubscription();
  if (sub) {
    try {
      await api.delete("/me/web-push", { data: { endpoint: sub.endpoint } });
    } catch { /* the server drops it anyway once the sign-in ends */ }
    await sub.unsubscribe();
  }
  writeOwner(null);
}

/** Sends a test notification to your own browsers. */
export async function sendTestPush(): Promise<void> {
  await api.post("/me/web-push/test");
}

/**
 * On load: keep this browser's subscription attached to the current sign-in
 * (a new sign-in after a password change gets a new session), or remove it if
 * it belongs to somebody else. Silent and best-effort.
 */
export async function syncPush(userId: string): Promise<void> {
  try {
    const sub = await existingSubscription();
    if (!sub) return;
    if (readOwner() !== userId || Notification.permission !== "granted") {
      await sub.unsubscribe();
      writeOwner(null);
      return;
    }
    await api.post("/me/web-push", { subscription: sub.toJSON() });
  } catch { /* offline, or push not set up; try again next load */ }
}

/** Signing out: stop this browser's notifications. Never holds the sign-out up for long. */
export async function dropPush(): Promise<void> {
  await Promise.race([
    turnOffPush().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);
}
