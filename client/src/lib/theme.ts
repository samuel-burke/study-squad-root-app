export type ThemeMode = "light" | "dark";

/** The colour behind the app in each theme, for the browser's own chrome. */
const THEME_COLORS: Record<ThemeMode, string> = { dark: "#0E1320", light: "#F4F6FB" };

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

/** Switches every themed colour in styles.css by setting data-theme on <html>. */
export function applyTheme(mode: ThemeMode, doc: Document = document): void {
  const html = doc.documentElement;
  if (html.dataset.theme === mode) return;
  html.dataset.theme = mode;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[mode]);
}

/** The device's light/dark preference, or dark when it can't be read. */
export function systemTheme(): ThemeMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Follows the device's light/dark preference until stopped. Used outside
 * Root (the demo build) and as the fallback when Root can't report a theme.
 */
export function followSystemTheme(): () => void {
  applyTheme(systemTheme());
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const list = window.matchMedia("(prefers-color-scheme: light)");
  const onChange = () => applyTheme(list.matches ? "light" : "dark");
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}
