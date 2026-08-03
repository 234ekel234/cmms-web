/**
 * Theme preference: what the user picked (System / Light / Dark) versus what is
 * actually painted (light or dark).
 *
 * The CSS keys everything off `data-theme` on <html>, so "System" is resolved
 * here rather than by a media query. That keeps one code path — a media query
 * and an explicit override can otherwise disagree about which wins.
 */

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "tu-theme";

const PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

export function isThemePreference(v: unknown): v is ThemePreference {
  return typeof v === "string" && (PREFERENCES as string[]).includes(v);
}

/** What the OS is asking for. Falls back to light where matchMedia is absent. */
export function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    // Private-mode / blocked storage — fall back to following the OS.
    return "system";
  }
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === "system" ? systemTheme() : pref;
}

/** Paints a theme without touching the stored preference. */
export function applyTheme(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme;
}

/** Stores the preference and paints the theme it resolves to. */
export function setThemePreference(pref: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Preference won't survive a reload, but the current page still themes.
  }
  applyTheme(resolveTheme(pref));
}

/**
 * Keeps "System" live: repaints when the OS flips while the tab is open.
 * Returns an unsubscribe function.
 */
export function watchSystemTheme(onChange: (theme: ResolvedTheme) => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: MediaQueryListEvent) => onChange(e.matches ? "dark" : "light");
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

/**
 * Runs in <head> before first paint so the page never flashes the wrong theme.
 * Inlined as a string because it must execute ahead of React hydration.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(p!=="light"&&p!=="dark"){p=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=p}catch(e){document.documentElement.dataset.theme="light"}})()`;
