import { rootClient, type RootThemeMode } from "@rootsdk/client-app";
import { applyTheme, followSystemTheme, isThemeMode } from "../lib/theme";

/**
 * Matches the app to the theme the person picked in Root, and keeps
 * following it when they switch. If Root can't say (an older client, or
 * the bridge isn't there), falls back to the device's light/dark setting.
 */
export function followRootTheme(): () => void {
  let initial: unknown;
  try {
    initial = rootClient.theme.getTheme();
  } catch {
    initial = undefined;
  }
  if (!isThemeMode(initial)) return followSystemTheme();

  applyTheme(initial);
  const onUpdate = (mode: RootThemeMode) => {
    if (isThemeMode(mode)) applyTheme(mode);
  };
  rootClient.theme.on("theme.update", onUpdate);
  return () => {
    rootClient.theme.off("theme.update", onUpdate);
  };
}
