import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SelfTestApi } from "../src/api/gateway";
import { SelfTestPanel } from "../src/components/SelfTestPanel";

class FakeAudioContext {
  state = "running";
  destination = {};
  resume = () => Promise.resolve();
  createMediaElementSource = vi.fn(() => ({ connect: (n: unknown) => n }));
}

class FakeAudio {
  static last: FakeAudio;
  crossOrigin: string | null = null;
  src = "";
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  constructor() {
    FakeAudio.last = this;
  }
}

async function load() {
  vi.resetModules();
  return import("../src/lib/hostedAudioCheck");
}

describe("checkHostedAudio", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("downloads with CORS and plays through Web Audio", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(new Uint8Array(1234))));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("Audio", FakeAudio);
    const { checkHostedAudio, TEST_TONE_URL } = await load();
    expect(await checkHostedAudio()).toMatch(/^Playing: downloaded 1234 bytes/);
    expect(fetch).toHaveBeenCalledWith(TEST_TONE_URL, { mode: "cors", cache: "no-store" });
    expect(FakeAudio.last.crossOrigin).toBe("anonymous");
    expect(FakeAudio.last.play).toHaveBeenCalled();
  });

  it("reports a blocked download", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    const { checkHostedAudio } = await load();
    expect(await checkHostedAudio()).toBe("Failed: Failed to fetch");
  });

  it("reports a missing file", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("", { status: 404 })));
    const { checkHostedAudio } = await load();
    expect(await checkHostedAudio()).toBe("Download failed: HTTP 404");
  });

  it("reports when playback is refused", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(new Uint8Array(10))));
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        override play = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
      },
    );
    const { checkHostedAudio } = await load();
    expect(await checkHostedAudio()).toBe("Failed: NotAllowedError");
  });
});

describe("SelfTestPanel hosted audio button", () => {
  it("shows the result of the check", async () => {
    const selfTest: SelfTestApi = {
      get: () => Promise.resolve({ allowed: true, report: null }),
      run: vi.fn(),
      clientInfo: () => Promise.resolve({}),
    };
    const check = vi.fn(() => Promise.resolve("Playing: ok"));
    render(<SelfTestPanel selfTest={selfTest} checkAudio={check} />);
    await userEvent.click(await screen.findByRole("button", { name: "Test hosted audio" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Playing: ok");
  });
});
