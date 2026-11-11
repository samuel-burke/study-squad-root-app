import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { act, renderHook } from "@testing-library/react";
import type { MyStatusKind } from "@studyroom/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAmbient } from "../src/state/useAmbient";

describe("useAmbient", () => {
  afterEach(() => window.localStorage.clear());

  function setup(initial: MyStatusKind | null) {
    const apply = vi.fn();
    const hook = renderHook(({ status }) => useAmbient(status, apply), {
      initialProps: { status: initial },
    });
    return { apply, ...hook };
  }

  it("is off by default at 40% volume", () => {
    const { apply, result } = setup("roomFocus");
    expect(result.current.sound).toBe("off");
    expect(result.current.volume).toBe(40);
    expect(apply).toHaveBeenLastCalledWith("off", 0.4, true);
  });

  it.each<[MyStatusKind, boolean]>([
    ["idle", false],
    ["roomFocus", true],
    ["soloFocus", true],
    ["roomBreak", false],
    ["soloBreak", false],
  ])("while %s, playing is %s", (status, playing) => {
    window.localStorage.setItem("studysquad.ambient", "rain");
    const { apply } = setup(status);
    expect(apply).toHaveBeenLastCalledWith("rain", 0.4, playing);
  });

  it("fades out on a break and back in for the next round", () => {
    window.localStorage.setItem("studysquad.ambient", "lofi");
    const { apply, rerender } = setup("roomFocus");
    rerender({ status: "roomBreak" });
    expect(apply).toHaveBeenLastCalledWith("lofi", 0.4, false);
    rerender({ status: "roomFocus" });
    expect(apply).toHaveBeenLastCalledWith("lofi", 0.4, true);
  });

  it("saves the sound and volume on this device", () => {
    const { apply, result } = setup("soloFocus");
    act(() => result.current.setSound("cafe"));
    act(() => result.current.setVolume(75));
    expect(apply).toHaveBeenLastCalledWith("cafe", 0.75, true);
    expect(window.localStorage.getItem("studysquad.ambient")).toBe("cafe");
    expect(window.localStorage.getItem("studysquad.ambientVolume")).toBe("75");
    const again = setup("idle").result.current;
    expect(again.sound).toBe("cafe");
    expect(again.volume).toBe(75);
  });

  it("ignores saved values it doesn't know", () => {
    window.localStorage.setItem("studysquad.ambient", "thunder");
    window.localStorage.setItem("studysquad.ambientVolume", "250");
    const { result } = setup("idle");
    expect(result.current.sound).toBe("off");
    expect(result.current.volume).toBe(40);
  });

  it("stops the sound when the room screen goes away", () => {
    window.localStorage.setItem("studysquad.ambient", "rain");
    const { apply, unmount } = setup("roomFocus");
    unmount();
    expect(apply).toHaveBeenLastCalledWith("off", 0, false);
  });

  it("keeps working when audio throws", () => {
    const { apply, rerender } = setup("idle");
    apply.mockImplementation(() => {
      throw new Error("audio device lost");
    });
    expect(() => rerender({ status: "roomFocus" })).not.toThrow();
  });
});

/** Records gain changes and stands in for the media element source. */
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = "running";
  currentTime = 10;
  destination = {};
  ramps: [number, number][] = [];
  gainNode = {
    gain: {
      value: 0,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn((v: number, t: number) => this.ramps.push([v, t])),
    },
    connect: (node: unknown) => node,
  };
  resume = vi.fn(() => Promise.resolve());
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createGain() {
    return this.gainNode;
  }
  createMediaElementSource = vi.fn(() => ({ connect: (node: unknown) => node }));
}

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  src = "";
  loop = false;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  constructor() {
    super();
    FakeAudio.instances.push(this);
  }
}

describe("setAmbient", () => {
  beforeEach(() => {
    FakeAudioContext.instances = [];
    FakeAudio.instances = [];
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("Audio", FakeAudio);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function load() {
    vi.resetModules();
    return import("../src/lib/ambient");
  }

  it("does nothing until a sound should play", async () => {
    const { setAmbient } = await load();
    setAmbient("rain", 0.4, false);
    setAmbient("off", 0.4, true);
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it("loops rain and fades it in over two seconds", async () => {
    const { setAmbient, AMBIENT_FILES } = await load();
    setAmbient("rain", 0.4, true);
    const audio = FakeAudio.instances[0]!;
    expect(audio.src).toBe(AMBIENT_FILES.rain[0]);
    expect(audio.loop).toBe(true);
    expect(audio.play).toHaveBeenCalled();
    expect(FakeAudioContext.instances[0]!.ramps.at(-1)).toEqual([0.4, 12]);
  });

  it("fades out on a break, then pauses", async () => {
    const { setAmbient } = await load();
    setAmbient("cafe", 0.5, true);
    setAmbient("cafe", 0.5, false);
    const audio = FakeAudio.instances[0]!;
    expect(FakeAudioContext.instances[0]!.ramps.at(-1)).toEqual([0, 12]);
    expect(audio.pause).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(audio.pause).toHaveBeenCalled();
  });

  it("changes volume quickly while playing", async () => {
    const { setAmbient } = await load();
    setAmbient("rain", 0.4, true);
    setAmbient("rain", 0.8, true);
    expect(FakeAudioContext.instances[0]!.ramps.at(-1)).toEqual([0.8, 10.15]);
  });

  it("plays lo-fi tracks in order and wraps around", async () => {
    const { setAmbient, AMBIENT_FILES } = await load();
    setAmbient("lofi", 0.4, true);
    const audio = FakeAudio.instances[0]!;
    expect(audio.loop).toBe(false);
    const heard = [audio.src];
    for (let i = 0; i < 3; i++) {
      audio.dispatchEvent(new Event("ended"));
      heard.push(audio.src);
    }
    expect(heard).toEqual([...AMBIENT_FILES.lofi, AMBIENT_FILES.lofi[0]]);
  });

  it("reuses one audio element when switching sounds", async () => {
    const { setAmbient, AMBIENT_FILES } = await load();
    setAmbient("rain", 0.4, true);
    setAmbient("cafe", 0.4, true);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0]!.src).toBe(AMBIENT_FILES.cafe[0]);
    expect(FakeAudioContext.instances[0]!.createMediaElementSource).toHaveBeenCalledTimes(1);
  });
});

describe("bundled audio", () => {
  const dir = join(__dirname, "../src/assets/ambient/");

  it("credits every file in CREDITS.md with a CC0 license", () => {
    const credits = readFileSync(`${dir}/CREDITS.md`, "utf8");
    const files = readdirSync(dir).filter((f) => f.endsWith(".mp3"));
    expect(files.sort()).toEqual([
      "cafe.mp3",
      "lofi-1.mp3",
      "lofi-2.mp3",
      "lofi-3.mp3",
      "rain.mp3",
    ]);
    for (const file of files) {
      const row = credits.split("\n").find((line) => line.includes(`\`${file}\``));
      expect(row, `${file} is listed`).toBeDefined();
      expect(row).toContain("CC0");
    }
  });

  it("keeps the files small enough for the package", () => {
    const total = readdirSync(dir)
      .filter((f) => f.endsWith(".mp3"))
      .reduce((sum, f) => sum + readFileSync(`${dir}/${f}`).length, 0);
    expect(total).toBeLessThan(9 * 1024 * 1024);
  });
});
