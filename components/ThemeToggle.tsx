"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  getThemePreference,
  resolveTheme,
  setThemePreference,
  watchSystemTheme,
  type ThemePreference,
} from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; Icon: () => React.ReactElement }[] = [
  { value: "system", label: "System", Icon: IconMonitor },
  { value: "light", label: "Light", Icon: IconSun },
  { value: "dark", label: "Dark", Icon: IconMoon },
];

export default function ThemeToggle() {
  // The real value lives in localStorage and is applied before hydration, so
  // render "system" on the server and correct it on mount rather than reading
  // storage during render.
  const [pref, setPref] = useState<ThemePreference>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPref(getThemePreference());
    setReady(true);
  }, []);

  // Only "System" tracks the OS; an explicit choice must survive the OS flipping.
  useEffect(() => {
    if (pref !== "system") return;
    return watchSystemTheme(applyTheme);
  }, [pref]);

  function choose(value: ThemePreference) {
    setPref(value);
    setThemePreference(value);
  }

  return (
    <div
      className="tu-segmented"
      role="radiogroup"
      aria-label="Theme"
      style={{ opacity: ready ? 1 : 0.6 }}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={ready && pref === value}
          onClick={() => choose(value)}
          className={ready && pref === value ? "tu-active" : undefined}
          style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
        >
          <Icon />
          {label}
        </button>
      ))}
    </div>
  );
}

/** Renders what "System" currently resolves to, so the choice isn't ambiguous. */
export function ThemeHint() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    function update() {
      const p = getThemePreference();
      setText(p === "system" ? `Following your device, currently ${resolveTheme(p)}.` : null);
    }
    update();
    return watchSystemTheme(update);
  }, []);

  if (!text) return null;
  return <p style={{ fontSize: 13, color: "var(--tu-text-subtle)", marginTop: 10 }}>{text}</p>;
}

const SVG = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function IconMonitor() {
  return (
    <svg {...SVG}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

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
