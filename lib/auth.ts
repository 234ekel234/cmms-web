export type User = {
  id: string;
  name: string;
  role: "GENERAL_MANAGER" | "MANAGER" | "SUPERVISOR" | "TECHNICIAN" | "CLIENT";
  email: string;
  /** Set when someone else chose the password; the API refuses all else until it changes. */
  mustChangePassword?: boolean;
};

export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function saveSession(token: string, user: User) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  try { sessionStorage.removeItem(SIGNED_OUT_KEY); } catch { /* nothing to clear */ }
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

/**
 * Why this browser was just signed out, carried across the redirect to /login
 * so the page can say so — "signed out after a long time away" rather than an
 * unexplained login form. Cleared by the next sign-in rather than on reading,
 * because React runs a development effect twice and the second read would
 * find nothing.
 */
const SIGNED_OUT_KEY = "signedOutReason";

export function noteSignedOut(reason: string) {
  try { sessionStorage.setItem(SIGNED_OUT_KEY, reason); } catch { /* private mode: no note, still signed out */ }
}

export function signedOutReason(): string | null {
  try { return sessionStorage.getItem(SIGNED_OUT_KEY); } catch { return null; }
}

export function isLoggedIn(): boolean {
  return !!getToken();
}
