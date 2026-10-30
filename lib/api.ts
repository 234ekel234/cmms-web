import axios from "axios";
import { clearSession, loginUrl, noteSignedOut } from "@/lib/auth";

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
  return config;
});

api.interceptors.response.use(
  (res) => {
    const dateHeader = res.headers?.["date"];
    if (dateHeader) {
      const serverMs = new Date(dateHeader).getTime();
      if (!Number.isNaN(serverMs)) serverClockOffsetMs = serverMs - Date.now();
    }
    return res;
  },
  (err) => {
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
      if (window.location.pathname !== "/login") window.location.href = loginUrl();
    }
    // A password someone else chose must be replaced first; the API refuses
    // everything else until it is (backend withCurrentRole).
    if (
      err.response?.status === 403 &&
      err.response?.data?.code === "PASSWORD_CHANGE_REQUIRED" &&
      typeof window !== "undefined" &&
      window.location.pathname !== "/change-password"
    ) {
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
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === "string" && msg ? msg : fallback;
}

export default api;
