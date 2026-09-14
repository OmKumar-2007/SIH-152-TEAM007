"use client";

import * as React from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "sih-theme";

interface ThemeContextValue {
  /** What the user chose, including "system". */
  theme: Theme;
  /** What is actually painted right now. */
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

/**
 * The script that runs before first paint.
 *
 * Applying the theme from React would mean rendering light, hydrating, then
 * switching — a white flash on every load for anyone using dark mode. This runs
 * synchronously in <head>, so the correct attribute is on <html> before the
 * browser paints anything. It is inlined as a string because it has to execute
 * ahead of the bundle.
 */
export const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = (!stored || stored === 'system') ? (systemDark ? 'dark' : 'light') : stored;
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved;
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Starts as "system" on both server and client so the first render matches the
  // markup; the effect below reconciles with what the pre-paint script already did.
  const [theme, setThemeState] = React.useState<Theme>("system");
  const [resolved, setResolved] = React.useState<"light" | "dark">("dark");

  React.useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
    setThemeState(stored);
    const next = stored === "system" ? (systemPrefersDark() ? "dark" : "light") : stored;
    setResolved(next);
    apply(next);
  }, []);

  // Follow the OS while the choice is "system" — and stop following the moment
  // the user picks a side, which is the whole point of having an explicit choice.
  React.useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = media.matches ? "dark" : "light";
      setResolved(next);
      apply(next);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    const applied = next === "system" ? (systemPrefersDark() ? "dark" : "light") : next;
    setResolved(applied);
    apply(applied);
  }, []);

  const toggle = React.useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  const value = React.useMemo(
    () => ({ theme, resolved, setTheme, toggle }),
    [theme, resolved, setTheme, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) {
    // Charts and primitives call this from anywhere; falling back to dark is
    // better than throwing and taking the page down over a colour.
    return { theme: "system", resolved: "dark", setTheme: () => {}, toggle: () => {} };
  }
  return context;
}
