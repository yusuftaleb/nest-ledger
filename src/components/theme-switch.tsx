"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";

export type Theme = "system" | "light" | "dark";
const OPTIONS = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
] as const;

/** Applies a theme to the page right away and remembers it for the server's next render. */
export function applyTheme(next: Theme) {
  const root = document.documentElement;
  if (next === "system") root.removeAttribute("data-theme"); else root.dataset.theme = next;
  document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Light / Dark / System. The choice is a cookie so the server renders the right theme on the first
 * paint (no flash), and it applies instantly here by setting data-theme on <html>.
 */
export function ThemeSwitch({ initial, compact }: { initial: Theme; compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>(initial);
  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }
  return (
    <div className={`nl-seg${compact ? " nl-seg-icons" : ""}`} role="radiogroup" aria-label="Appearance">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button key={value} type="button" role="radio" aria-checked={theme === value} onClick={() => choose(value)}
          aria-label={compact ? label : undefined} title={compact ? label : undefined}>
          <Icon size={16} strokeWidth={1.75} aria-hidden />
          {!compact && label}
        </button>
      ))}
    </div>
  );
}

/**
 * One tap between light and dark, for phones where Settings is a page away. Both icons are drawn and CSS shows
 * the one for the theme you'd switch to, so it's right on the first paint even when following the system.
 */
export function ThemeFlip({ className = "" }: { className?: string }) {
  function flip() {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(dark ? "light" : "dark");
  }
  return (
    <button type="button" className={`icon-btn theme-flip ${className}`} onClick={flip} aria-label="Switch between light and dark">
      <Moon className="to-dark" size={20} strokeWidth={1.75} aria-hidden />
      <Sun className="to-light" size={20} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
