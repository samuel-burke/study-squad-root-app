import { act, render } from "@testing-library/react";
import type { BossDto } from "@studyroom/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BadgeUnlocked } from "../src/components/BadgeUnlocked";
import { BossDefeated } from "../src/components/BossDefeated";
import type * as UnlockShow from "../src/lib/unlockShow";

// Records every frame the shows draw, as [t, width, height].
const draws = vi.hoisted(() => [] as [number, number, number][]);
vi.mock("../src/lib/unlockShow", async (real) => ({
  ...(await real<typeof UnlockShow>()),
  ShowPainter: class {
    draw(t: number, W: number, H: number) {
      draws.push([t, W, H]);
    }
  },
}));

let size = { w: 390, h: 844 };

beforeEach(() => {
  draws.length = 0;
  size = { w: 390, h: 844 };
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return { canvas: this, setTransform() {} } as never;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => size.w);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => size.h);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Lets the show finish, rotates the phone, and returns the canvas and the frames since. */
function rotateAfterShow(container: HTMLElement) {
  act(() => vi.advanceTimersByTime(60_000));
  const canvas = container.querySelector("canvas")!;
  expect(canvas.width).toBe(390);
  const done = draws.length;
  // Frames have stopped.
  act(() => vi.advanceTimersByTime(1_000));
  expect(draws.length).toBe(done);
  size = { w: 844, h: 390 };
  act(() => {
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(100);
  });
  return { canvas, frames: draws.slice(done), last: draws[done - 1]! };
}

describe("after the show, rotating the phone", () => {
  it("redraws the badge's last frame at the new size", () => {
    const { container } = render(
      <BadgeUnlocked badgeId="focus-100h" play={() => {}} onDismiss={() => {}} />,
    );
    const { canvas, frames, last } = rotateAfterShow(container);
    expect(canvas.width).toBe(844);
    expect(canvas.height).toBe(390);
    expect(frames).toEqual([[last[0], 844, 390]]);
  });

  it("redraws the boss's last frame at the new size", () => {
    const boss: BossDto = {
      enabled: true,
      name: "The Procrastinator",
      maxHpXp: 12_000,
      damageXp: 12_000,
      strength: 1,
      lootXp: 50,
      endsAt: 0,
      defeated: true,
    };
    const { container } = render(<BossDefeated boss={boss} onDismiss={() => {}} />);
    const { canvas, frames, last } = rotateAfterShow(container);
    expect(canvas.width).toBe(844);
    expect(frames).toEqual([[last[0], 844, 390]]);
  });
});
