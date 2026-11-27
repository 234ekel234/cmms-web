import axios from "axios";
import { clearSession, getUser, loginUrl, noteSignedOut } from "@/lib/auth";
import { OFFLINE_DATA_EVENT, ONLINE_DATA_EVENT, readResponse, saveResponse } from "@/lib/offlineData";

declare module "axios" {
  interface AxiosRequestConfig {
    /**
     * A 401 on this request is the caller's to handle: the session is still
     * cleared, but nobody is sent to the login page. For pages open to people
     * signed out (a location sticker), where a dead session must fall back to
     * the signed-out page rather than hide it behind a sign-in form.
     */
    keepPageOn401?: boolean;
  }
}

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Difference (ms) between the API server's clock and this browser's clock,
// derived from the Date header on every response. Live work-order timers add
// this to Date.now() so the running display matches the server-authoritative
// value the backend stores on pause — otherwise a skewed browser clock (e.g.
// WSL2 drift) makes the timer jump when paused/resumed.
let serverClockOffsetMs = 0;
export function getServerClockOffset() {
  return serverClockOffsetMs;
}
export function serverNow() {
  return Date.now() + serverClockOffsetMs;
}

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  // A read on one bar of signal can hang for minutes; give up and use the copy
  // on this device instead (below). Writes keep no limit — an upload is slow.
  if ((config.method ?? "get") === "get" && config.timeout == null) config.timeout = 15_000;
  return config;
});

// ── Offline copies (lib/offlineData.ts) ─────────────────────────────────────
// Every successful JSON read is kept on this device for its signed-in person,
// and a read that fails for want of a network is answered from that copy.
function offlineKey(config: { url?: string; responseType?: string; method?: string } & Parameters<typeof api.getUri>[0]): string | null {
  if ((config.method ?? "get") !== "get") return null;
  if (config.responseType && config.responseType !== "json") return null;
  const url = String(config.url ?? "");
  if (url.startsWith("/auth/")) return null;
  try { return api.getUri(config); } catch { return null; }
}

api.interceptors.response.use(
  (res) => {
    const dateHeader = res.headers?.["date"];
    if (dateHeader) {
      const serverMs = new Date(dateHeader).getTime();
      if (!Number.isNaN(serverMs)) serverClockOffsetMs = serverMs - Date.now();
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(ONLINE_DATA_EVENT));
      const key = offlineKey(res.config);
      const userId = getUser()?.id;
      if (key && userId && res.data !== undefined) void saveResponse(userId, key, res.data);
    }
    return res;
  },
  async (err) => {
    // No answer at all — no signal, the server unreachable, or the read timed
    // out. For a read, the copy kept on this device is better than an error.
    if (!err.response && err.config && typeof window !== "undefined") {
      const key = offlineKey(err.config);
      const userId = getUser()?.id;
      if (key && userId) {
        const saved = await readResponse(userId, key);
        if (saved) {
          window.dispatchEvent(new CustomEvent(OFFLINE_DATA_EVENT, { detail: { savedAt: saved.savedAt } }));
          return { data: saved.data, status: 200, statusText: "OK (saved on this device)", headers: { "x-hanni-saved-at": String(saved.savedAt) }, config: err.config };
        }
      }
      window.dispatchEvent(new CustomEvent(OFFLINE_DATA_EVENT, { detail: { savedAt: null } }));
    }
    // A 401 means the session is over — except from the sign-in calls
    // themselves, where it means a wrong password. Those used to fall in here
    // too, and the hard reload threw away the "Incorrect email or password"
    // the login form had just set, so a typo looked like the page blinking.
    const url = String(err.config?.url ?? "");
    const signingIn = url.startsWith("/auth/");
    if (err.response?.status === 401 && !signingIn && typeof window !== "undefined") {
      clearSession();
      // Said on the login page: "you were signed out" beats an unexplained form.
      const reason = err.response?.data?.error;
      if (typeof reason === "string" && reason) noteSignedOut(reason);
      if (window.location.pathname !== "/login" && !err.config?.keepPageOn401) window.location.href = loginUrl();
    }
    // A password someone else chose must be replaced first; the API refuses
    // everything else until it is (backend withCurrentRole).
    if (
      err.response?.status === 403 &&
      err.response?.data?.code === "PASSWORD_CHANGE_REQUIRED" &&
      typeof window !== "undefined" &&
      window.location.pathname !== "/change-password"
    ) {
      // A full load on purpose: this runs in an axios interceptor, outside React
      // (no router to hand), and a fresh page drops state the session left behind.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/change-password";
    }
    return Promise.reject(err);
  }
);

/**
 * What to tell someone when a request failed: the API's own explanation when
 * it gave one (a 409 saying *why* an employee cannot be removed is the whole
 * point of the 409), else `fallback`. For the catch blocks around writes,
 * which used to swallow the failure and leave the user believing it worked.
 */
export function errorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: unknown } }; isAxiosError?: boolean };
  const msg = e?.response?.data?.error;
  if (typeof msg === "string" && msg) return msg;
  // No answer at all: say so, rather than a generic failure that sends people
  // looking for a fault that is really a missing signal.
  if (e?.isAxiosError && !e.response) return "You're offline. This needs a connection; try again when you have signal.";
  return fallback;
}

export default api;
