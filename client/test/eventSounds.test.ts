import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EVENT_SOUNDS,
  eventSoundLength,
  fanfareLength,
  type EventSound,
} from "../src/lib/eventSounds";
import { eventSoundsFor, useEventSounds, type EventSoundState } from "../src/state/useEventSounds";

const base: EventSoundState = {
  celebrationAt: null,
  bossKey: "Grumbleweed:100",
  bossDefeated: false,
  level: 3,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("eventSoundsFor", () => {
  it("is quiet when nothing changed", () => {
    expect(eventSoundsFor(base, { ...base })).toEqual([]);
  });

  it("plays a celebration for each new round", () => {
    const first = { ...base, celebrationAt: 1_000 };
    expect(eventSoundsFor(base, first)).toEqual(["celebration"]);
    expect(eventSoundsFor(first, { ...first })).toEqual([]);
    expect(eventSoundsFor(first, { ...base, celebrationAt: 2_000 })).toEqual(["celebration"]);
    expect(eventSoundsFor(first, base)).toEqual([]);
  });

  it("plays the boss defeat only when this week's boss goes down", () => {
    expect(eventSoundsFor(base, { ...base, bossDefeated: true })).toEqual(["bossDefeat"]);
    const defeated = { ...base, bossDefeated: true };
    expect(eventSoundsFor(defeated, defeated)).toEqual([]);
    // A new week's boss that arrives already beaten isn't a fresh defeat.
    expect(eventSoundsFor(base, { ...defeated, bossKey: "Snoozelord:200" })).toEqual([]);
  });

  it("plays a level-up when your level rises, not when it drops", () => {
    expect(eventSoundsFor(base, { ...base, level: 4 })).toEqual(["levelUp"]);
    expect(eventSoundsFor(base, { ...base, level: 1 })).toEqual([]);
  });

  it("orders several at once: celebration, boss, then level-up", () => {
    expect(
      eventSoundsFor(base, { ...base, celebrationAt: 5, bossDefeated: true, level: 5 }),
    ).toEqual(["celebration", "bossDefeat", "levelUp"]);
  });
});

describe("useEventSounds", () => {
  function setup(initial: EventSoundState | null, muted = false) {
    const play = vi.fn<(sound: EventSound) => void>();
    const hook = renderHook(({ state, muted }) => useEventSounds(state, muted, play), {
      initialProps: { state: initial, muted },
    });
    return { play, ...hook };
  }

  it("stays quiet for the state the app opened with", () => {
    const { play, rerender } = setup(null);
    rerender({ state: { ...base, level: 9, bossDefeated: true }, muted: false });
    expect(play).not.toHaveBeenCalled();
    rerender({ state: { ...base, level: 10, bossDefeated: true }, muted: false });
    expect(play).toHaveBeenCalledWith("levelUp");
  });

  it("stays quiet while muted", () => {
    const { play, rerender } = setup(base, true);
    rerender({ state: { ...base, level: 4 }, muted: true });
    expect(play).not.toHaveBeenCalled();
  });

  it("waits for the whole boss music before the next sound", () => {
    vi.useFakeTimers();
    const { play, rerender } = setup(base);
    rerender({ state: { ...base, bossDefeated: true, level: 4 }, muted: false });
    expect(play.mock.calls).toEqual([["bossDefeat"]]);
    act(() => vi.advanceTimersByTime(eventSoundLength("bossDefeat") * 1000 - 100));
    expect(play).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(300));
    expect(play.mock.calls).toEqual([["bossDefeat"], ["levelUp"]]);
  });

  it("plays sounds that land together one after another", () => {
    vi.useFakeTimers();
    const { play, rerender } = setup(base);
    rerender({ state: { ...base, celebrationAt: 1, level: 4 }, muted: false });
    expect(play.mock.calls).toEqual([["celebration"]]);
    act(() => vi.advanceTimersByTime(fanfareLength(EVENT_SOUNDS.celebration) * 1000 + 200));
    expect(play.mock.calls).toEqual([["celebration"], ["levelUp"]]);
  });

  it("cancels queued sounds when the app closes", () => {
    vi.useFakeTimers();
    const { play, rerender, unmount } = setup(base);
    rerender({ state: { ...base, celebrationAt: 1, level: 4 }, muted: false });
    unmount();
    act(() => vi.advanceTimersByTime(10_000));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("keeps working when a sound throws", () => {
    const { play, rerender } = setup(base);
    play.mockImplementation(() => {
      throw new Error("audio device lost");
    });
    expect(() => rerender({ state: { ...base, level: 4 }, muted: false })).not.toThrow();
  });
});

describe("event sound synthesis", () => {
  /** Just enough of Web Audio for scheduleFanfare, counting the oscillators it starts. */
  class FakeAudioContext {
    static started = 0;
    state = "running";
    currentTime = 0;
    sampleRate = 8_000;
    destination = {};
    private node() {
      const param = () => ({
        value: 0,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      });
      return {
        type: "",
        buffer: null,
        frequency: param(),
        gain: param(),
        Q: param(),
        connect: (next: unknown) => next,
        start: () => FakeAudioContext.started++,
        stop: vi.fn(),
      };
    }
    createOscillator = () => this.node();
    createGain = () => this.node();
    createBiquadFilter = () => this.node();
    createDynamicsCompressor = () => this.node();
    createConvolver = () => this.node();
    createBufferSource = () => this.node();
    createBuffer = (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    });
  }

  it.each(["celebration", "levelUp"] as const)("schedules every note of %s", async (sound) => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.resetModules();
    const { playEventSound } = await import("../src/lib/eventSounds");
    FakeAudioContext.started = 0;
    playEventSound(sound);
    const fanfare = EVENT_SOUNDS[sound];
    expect(FakeAudioContext.started).toBe(fanfare.tones.length + (fanfare.noises?.length ?? 0));
  });

  it("does nothing without Web Audio", async () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.resetModules();
    const { playEventSound } = await import("../src/lib/eventSounds");
    expect(() => playEventSound("bossDefeat")).not.toThrow();
  });

  it("keeps each sound short enough not to drag", () => {
    for (const sound of Object.values(EVENT_SOUNDS)) {
      expect(fanfareLength(sound)).toBeLessThan(3.5);
    }
  });
});
