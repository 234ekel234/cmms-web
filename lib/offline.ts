import { pruneOfflineData } from "@/lib/offlineData";

/**
 * The installed app's offline side, from the page's end (public/sw.js does the
 * rest). Registered for every signed-in session, not only when notifications
 * are on, because the same worker is what lets pages open without signal.
 *
 * Production only: in development the worker would serve yesterday's build
 * over the one being edited.
 */
export function startOffline(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (process.env.NODE_ENV !== "production") return;
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  void pruneOfflineData();
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
