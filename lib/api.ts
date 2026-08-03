import axios from "axios";

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
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
