import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Chirp } from "../src/lib/sounds";
import { useCountdownChirps } from "../src/state/useCountdownChirps";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(endsAt: number | null, muted = false) {
  const play = vi.fn<(chirp: Chirp) => void>();
  const now = () => Date.now();
  const hook = renderHook(({ endsAt, muted }) => useCountdownChirps(endsAt, now, muted, play), {
    initialProps: { endsAt, muted },
  });
  return { play, ...hook };
}

describe("useCountdownChirps", () => {
  it("chirps at 1 minute left, then every second for the last 5", () => {
    const { play } = setup(25 * 60_000);
    const heard: [number, Chirp][] = [];
    play.mockImplementation((chirp) => heard.push([(25 * 60_000 - Date.now()) / 1000, chirp]));
    vi.advanceTimersByTime(25 * 60_000);
    expect(heard).toEqual([
      [60, "tick"],
      [5, "tick"],
      [4, "tick"],
      [3, "tick"],
      [2, "tick"],
      [1, "lastTick"],
    ]);
  });

  it("skips chirps already in the past instead of playing them late", () => {
    const { play } = setup(3_500);
    vi.advanceTimersByTime(5_000);
    expect(play.mock.calls).toEqual([["tick"], ["tick"], ["lastTick"]]);
  });

  it("stays quiet with no session or while muted", () => {
    const idle = setup(null);
    const muted = setup(20_000, true);
    vi.advanceTimersByTime(30_000);
    expect(idle.play).not.toHaveBeenCalled();
    expect(muted.play).not.toHaveBeenCalled();
  });

  it("stops at once when muted, the phase changes or the app closes", () => {
    const { play, rerender, unmount } = setup(70_000);
    vi.advanceTimersByTime(10_000);
    expect(play).toHaveBeenCalledTimes(1);
    rerender({ endsAt: 70_000, muted: true });
    vi.advanceTimersByTime(55_000);
    expect(play).toHaveBeenCalledTimes(1);

    rerender({ endsAt: 130_000, muted: false });
    vi.advanceTimersByTime(10_000);
    expect(play).toHaveBeenCalledTimes(2);
    unmount();
    vi.advanceTimersByTime(60_000);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("keeps counting when a chirp throws", () => {
    const { play } = setup(62_000);
    play.mockImplementation(() => {
      throw new Error("audio device lost");
    });
    expect(() => vi.advanceTimersByTime(62_000)).not.toThrow();
    expect(play).toHaveBeenCalledTimes(6);
  });

  it("stays on the clock when the device's timers stall, as in sleep or a background tab", () => {
    const { play } = setup(25 * 60_000);
    const heard: [number, Chirp][] = [];
    play.mockImplementation((chirp) => heard.push([(25 * 60_000 - Date.now()) / 1000, chirp]));
    // Timers stop for 20 minutes while the clock keeps going (a closed laptop lid).
    vi.advanceTimersByTime(60_000);
    vi.setSystemTime(21 * 60_000);
    vi.advanceTimersByTime(4 * 60_000);
    expect(heard).toEqual([
      [60, "tick"],
      [5, "tick"],
      [4, "tick"],
      [3, "tick"],
      [2, "tick"],
      [1, "lastTick"],
    ]);
  });

  it("skips a chirp the stalled timers already missed instead of playing it late", () => {
    const { play } = setup(10 * 60_000);
    // Timers stop from 3 minutes left until 30 seconds left: the 1 minute chirp is gone.
    vi.advanceTimersByTime(7 * 60_000);
    vi.setSystemTime(10 * 60_000 - 30_000);
    vi.advanceTimersByTime(30_000);
    expect(play.mock.calls).toEqual([["tick"], ["tick"], ["tick"], ["tick"], ["lastTick"]]);
  });

  it("follows the server clock when its offset is corrected mid-countdown", () => {
    const play = vi.fn<(chirp: Chirp) => void>();
    let offset = 0;
    const now = () => Date.now() + offset;
    const heard: [number, Chirp][] = [];
    play.mockImplementation((chirp) => heard.push([(120_000 - now()) / 1000, chirp]));
    renderHook(() => useCountdownChirps(120_000, now, false, play));
    vi.advanceTimersByTime(30_000);
    // A better clock sample says the server is 3 seconds ahead of what we thought.
    offset = 3_000;
    vi.advanceTimersByTime(90_000);
    expect(heard).toEqual([
      [60, "tick"],
      [5, "tick"],
      [4, "tick"],
      [3, "tick"],
      [2, "tick"],
      [1, "lastTick"],
    ]);
  });
});
