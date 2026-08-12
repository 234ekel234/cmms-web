"use client";

import { useSyncExternalStore } from "react";
import {
  applyTheme,
  getThemePreference,
  resolveTheme,
  setThemePreference,
  watchSystemTheme,
  watchThemePreference,
  type ResolvedTheme,
} from "@/lib/theme";

/**
 * The painted theme, read through useSyncExternalStore.
 *
 * The theme lives in localStorage and on <html data-theme>, which is external
 * mutable state that React does not own — exactly what this hook is for. The
 * alternative, mirroring it into useState and correcting on mount, is what the
 * Settings picker does; it works, but it renders once with a value known to be
 * wrong and needs a `ready` flag to hide the flicker.
 *
 * Subscribing to both sources keeps the button honest: an explicit choice from
 * anywhere (this button, the Settings picker, another tab) and — while the
 * preference is still "System" — the OS itself flipping. The OS branch repaints
 * as well as re-renders, since nothing else is watching on non-Settings pages.
 */
function subscribe(onChange: () => void) {
  const stopPref = watchThemePreference(onChange);
  const stopSystem = watchSystemTheme((next) => {
    if (getThemePreference() !== "system") return;
    applyTheme(next);
    onChange();
  });
  return () => {
    stopPref();
    stopSystem();
  };
}

// A string snapshot, so React's referential check compares by value.
const getSnapshot = (): ResolvedTheme => resolveTheme(getThemePreference());

// The server cannot know the visitor's choice. It renders the moon (the "go
// dark" affordance) and the client corrects on hydration; the inline script in
// <head> has already painted the right theme by then, so only this one icon
// settles, not the page.
const getServerSnapshot = (): ResolvedTheme => "light";

/**
 * One-click light/dark switch for the top bar.
 *
 * The full three-way picker (System / Light / Dark) stays in Settings; this is
 * the fast path next to the bell, where a segmented control with three labels
 * would not fit and would not be worth the width.
 *
 * It reads and writes *resolved* theme rather than preference, so clicking it
 * while on "System" commits an explicit choice — the opposite of whatever is
 * currently painted. That is a real, if small, loss: the OS no longer drives
 * the theme for that user until they set it back to System in Settings. It is
 * the honest reading of the click, though. Someone who presses a sun/moon
 * button wants *this* theme now, not a rule about how the theme is decided, and
 * silently keeping System while painting the override would leave the next OS
 * flip undoing their choice for reasons nothing on screen explains.
 */
export default function ThemeToggleButton() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const next: ResolvedTheme = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${next} theme`;

  return (
    <button
      type="button"
      className="tu-topbar-icon-btn"
      onClick={() => setThemePreference(next)}
      // Announce the action, not the state: a button named "Dark" is ambiguous
      // about whether that is what you get or what you already have.
      aria-label={label}
      title={label}
    >
      {/* Show the destination, matching the label — a sun means "go light". */}
      {theme === "dark" ? <IconSun /> : <IconMoon />}
    </button>
  );
}

const SVG = {
  width: 19,
  height: 19,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function IconSun() {
  return (
    <svg {...SVG}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg {...SVG}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
