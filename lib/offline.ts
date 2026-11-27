import { ONLINE_DATA_EVENT, pruneOfflineData } from "@/lib/offlineData";
import { syncOutbox } from "@/lib/offlineOutbox";

/**
 * The installed app's offline side, from the page's end (public/sw.js does the
 * rest). Registered for every signed-in session, not only when notifications
 * are on, because the same worker is what lets pages open without signal.
 *
 * Production only: in development the worker would serve yesterday's build
 * over the one being edited.
 */
export function startOffline(userId: string): void {
  if (typeof window === "undefined") return;
  startSending(userId);
  if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  void pruneOfflineData();
}

/**
 * Sends what was saved offline (lib/offlineOutbox.ts): now, when the browser
 * says the network is back, and when any request reaches the server — the
 * browser's "online" is often wrong in a building with a weak signal, and a
 * request that got through is the better evidence. Set up once per page load;
 * the current person is read each time, so signing in as someone else sends
 * only theirs.
 */
let sendingFor: string | null = null;
let listening = false;
let debounce: ReturnType<typeof setTimeout> | null = null;
function startSending(userId: string) {
  sendingFor = userId;
  void syncOutbox(userId);
  if (listening) return;
  listening = true;
  const soon = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => { if (sendingFor) void syncOutbox(sendingFor); }, 3000);
  };
  window.addEventListener("online", soon);
  window.addEventListener(ONLINE_DATA_EVENT, soon);
}

/**
 * Asks the worker to save these pages (and their code) now, so they open
 * offline even if nobody has visited them yet. Best effort, in the background.
 */
export async function warmPages(urls: string[]): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !navigator.onLine) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    (reg?.active ?? navigator.serviceWorker.controller)?.postMessage({ type: "warm", urls });
  } catch {
    // not ready yet; the next visit tries again
  }
}
