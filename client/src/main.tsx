import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { StudyRoomGateway } from "./api/gateway";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { applyTheme, followSystemTheme, isThemeMode, systemTheme } from "./lib/theme";
import "./styles.css";

// Paint in the device's theme straight away so the loading screen doesn't
// flash the wrong colours while the gateway (and Root's theme) loads.
applyTheme(systemTheme());

// The mode is fixed at build time, so the production bundle never contains
// the demo engine and the demo bundle never touches the Root client SDK.
async function createGateway(): Promise<StudyRoomGateway> {
  if (import.meta.env.MODE === "demo") {
    const { DemoGateway, demoOptionsFromSearch } = await import("./api/demoGateway");
    // ?theme=light or ?theme=dark pins the demo for screenshots.
    const pinned = new URLSearchParams(window.location.search).get("theme");
    if (isThemeMode(pinned)) applyTheme(pinned);
    else followSystemTheme();
    return DemoGateway.create(demoOptionsFromSearch(window.location.search));
  }
  const [{ RootGateway }, { followRootTheme }] = await Promise.all([
    import("./api/rootGateway"),
    import("./api/rootTheme"),
  ]);
  followRootTheme();
  return new RootGateway();
}

const root = createRoot(document.getElementById("root")!);
createGateway().then(
  (gateway) =>
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App gateway={gateway} />
        </ErrorBoundary>
      </StrictMode>,
    ),
  // A failed chunk load would otherwise leave a blank screen.
  (error: unknown) => {
    console.error("Study Squad failed to load", error);
    root.render(
      <div className="status-screen" role="alert">
        Study Squad couldn&apos;t load. Close and reopen the app.
      </div>,
    );
  },
);
