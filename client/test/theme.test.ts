import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, followSystemTheme, systemTheme } from "../src/lib/theme";

// Root's client SDK only works inside the Root app, so mock its theme service.
const sdk = vi.hoisted(() => {
  const listeners = new Set<(mode: unknown) => void>();
  return {
    listeners,
    getTheme: vi.fn((): unknown => "light"),
    emit: (mode: unknown) => listeners.forEach((l) => l(mode)),
  };
});
vi.mock("@rootsdk/client-app", () => ({
  rootClient: {
    theme: {
      getTheme: () => sdk.getTheme(),
      on: (_: string, l: (mode: unknown) => void) => sdk.listeners.add(l),
      off: (_: string, l: (mode: unknown) => void) => sdk.listeners.delete(l),
    },
  },
}));

const { followRootTheme } = await import("../src/api/rootTheme");

let prefersLight = false;
const mediaListeners = new Set<() => void>();
function setSystem(light: boolean) {
  prefersLight = light;
  mediaListeners.forEach((l) => l());
}

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  document.head.innerHTML = '<meta name="theme-color" content="#0E1320" />';
  sdk.listeners.clear();
  sdk.getTheme.mockReset().mockReturnValue("light");
  mediaListeners.clear();
  prefersLight = false;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      get matches() {
        return query.includes("light") && prefersLight;
      },
      addEventListener: (_: string, l: () => void) => mediaListeners.add(l),
      removeEventListener: (_: string, l: () => void) => mediaListeners.delete(l),
    })),
  );
});

afterEach(() => vi.unstubAllGlobals());

const theme = () => document.documentElement.dataset.theme;

describe("applyTheme", () => {
  it("sets data-theme on <html> and the browser theme colour", () => {
    applyTheme("light");
    expect(theme()).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      "#F4F6FB",
    );
    applyTheme("dark");
    expect(theme()).toBe("dark");
  });
});

describe("system theme", () => {
  it("reads prefers-color-scheme and follows changes", () => {
    expect(systemTheme()).toBe("dark");
    const stop = followSystemTheme();
    expect(theme()).toBe("dark");
    setSystem(true);
    expect(theme()).toBe("light");
    stop();
    setSystem(false);
    expect(theme()).toBe("light");
  });
});

describe("followRootTheme", () => {
  it("uses Root's theme and follows Root's theme updates", () => {
    const stop = followRootTheme();
    expect(theme()).toBe("light");
    sdk.emit("dark");
    expect(theme()).toBe("dark");
    sdk.emit("sepia");
    expect(theme()).toBe("dark");
    stop();
    sdk.emit("light");
    expect(theme()).toBe("dark");
  });

  it("ignores the device setting while Root reports a theme", () => {
    sdk.getTheme.mockReturnValue("dark");
    followRootTheme();
    setSystem(true);
    expect(theme()).toBe("dark");
  });

  it("falls back to the device setting when Root can't say", () => {
    sdk.getTheme.mockImplementation(() => {
      throw new Error("no bridge");
    });
    prefersLight = true;
    followRootTheme();
    expect(theme()).toBe("light");
    setSystem(false);
    expect(theme()).toBe("dark");
  });
});
