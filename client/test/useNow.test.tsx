import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNow } from "../src/state/useNow";

describe("useNow", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps ticking while the caller re-renders faster than the interval", () => {
    let t = 0;
    // A fresh function each render, like App's gateway.now.bind(gateway).
    const { result, rerender } = renderHook(() => useNow(() => t));
    // Music progress re-renders the app about every 200 ms.
    for (let i = 0; i < 10; i++) {
      t += 200;
      act(() => {
        vi.advanceTimersByTime(200);
      });
      rerender();
    }
    expect(result.current).toBeGreaterThanOrEqual(1800);
  });

  it("flips on the countdown's second, not up to a tick later", () => {
    vi.setSystemTime(0);
    // 5.13 s left: the clock shows 6 until 130 ms from now, then 5 until 1,130.
    const { result } = renderHook(() => useNow(() => Date.now(), 5_130));
    act(() => {
      vi.advanceTimersByTime(130);
    });
    expect(result.current).toBe(130);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(1_130);
  });
});
