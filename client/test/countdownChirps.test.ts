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
  it("chirps at 10 seconds left, then every second for the last 5", () => {
    const { play } = setup(60_000);
    const heard: [number, Chirp][] = [];
    play.mockImplementation((chirp) => heard.push([(60_000 - Date.now()) / 1000, chirp]));
    vi.advanceTimersByTime(60_000);
    expect(heard).toEqual([
      [10, "tick"],
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
    const { play, rerender, unmount } = setup(20_000);
    vi.advanceTimersByTime(10_000);
    expect(play).toHaveBeenCalledTimes(1);
    rerender({ endsAt: 20_000, muted: true });
    vi.advanceTimersByTime(5_000);
    expect(play).toHaveBeenCalledTimes(1);

    rerender({ endsAt: 40_000, muted: false });
    vi.advanceTimersByTime(15_000);
    expect(play).toHaveBeenCalledTimes(2);
    unmount();
    vi.advanceTimersByTime(10_000);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("keeps counting when a chirp throws", () => {
    const { play } = setup(12_000);
    play.mockImplementation(() => {
      throw new Error("audio device lost");
    });
    expect(() => vi.advanceTimersByTime(12_000)).not.toThrow();
    expect(play).toHaveBeenCalledTimes(6);
  });
});
