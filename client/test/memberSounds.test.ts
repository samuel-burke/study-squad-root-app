import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { memberSoundFor, useMemberSounds } from "../src/state/useMemberSounds";

describe("memberSoundFor", () => {
  it("chimes for someone else joining or leaving", () => {
    expect(memberSoundFor(["a"], ["a", "b"], "you")).toBe("memberJoin");
    expect(memberSoundFor(["a", "b"], ["a"], "you")).toBe("memberLeave");
  });

  it("stays quiet for you, and for the same people in a new order", () => {
    expect(memberSoundFor(["a"], ["a", "you"], "you")).toBeNull();
    expect(memberSoundFor(["a", "you"], ["a"], "you")).toBeNull();
    expect(memberSoundFor(["a", "b"], ["b", "a"], "you")).toBeNull();
  });

  it("plays the join when one person swaps for another", () => {
    expect(memberSoundFor(["a"], ["b"], "you")).toBe("memberJoin");
  });
});

describe("useMemberSounds", () => {
  const render = (muted = false) => {
    const play = vi.fn();
    const hook = renderHook(
      ({ ids }: { ids: string[] | null }) => useMemberSounds(ids, "you", muted, play),
      { initialProps: { ids: ["you", "a"] as string[] | null } },
    );
    return { play, rerender: (ids: string[] | null) => hook.rerender({ ids }) };
  };

  it("stays quiet for the board the app opened with, then plays on changes", () => {
    const { play, rerender } = render();
    expect(play).not.toHaveBeenCalled();
    rerender(["you", "a", "b"]);
    rerender(["you", "a", "b"]);
    rerender(["you", "b"]);
    expect(play.mock.calls).toEqual([["memberJoin"], ["memberLeave"]]);
  });

  it("stays quiet while muted", () => {
    const { play, rerender } = render(true);
    rerender(["you", "a", "b"]);
    expect(play).not.toHaveBeenCalled();
  });

  it("keeps working when a sound throws", () => {
    const { play, rerender } = render();
    play.mockImplementation(() => {
      throw new Error("no audio");
    });
    expect(() => rerender(["you", "a", "b"])).not.toThrow();
  });
});
