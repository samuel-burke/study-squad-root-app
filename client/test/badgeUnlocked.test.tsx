import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BADGES } from "@studyroom/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BadgeUnlocked } from "../src/components/BadgeUnlocked";
import { FANFARES } from "../src/lib/badgeSounds";

afterEach(() => {
  vi.useRealTimers();
});

describe("BadgeUnlocked", () => {
  it("names the tier, plays its fanfare, and moves on with the button", async () => {
    const play = vi.fn();
    const onDismiss = vi.fn();
    render(<BadgeUnlocked badgeId="focus-100h" play={play} onDismiss={onDismiss} />);
    const dialog = screen.getByRole("dialog", { name: "Centurion" });
    expect(dialog).toHaveTextContent("Gold badge unlocked!");
    expect(play).toHaveBeenCalledWith("gold");
    expect(screen.getByRole("button", { name: "Nice!" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Nice!" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when sounds are muted", () => {
    const play = vi.fn();
    render(<BadgeUnlocked badgeId="leet" muted play={play} onDismiss={() => {}} />);
    expect(screen.getByRole("dialog", { name: "1337" })).toHaveTextContent("Secret badge found!");
    expect(play).not.toHaveBeenCalled();
  });

  it("closes with Escape, or by itself after a longer show for rarer tiers", () => {
    vi.useFakeTimers();
    const bronze = vi.fn();
    const { unmount } = render(
      <BadgeUnlocked badgeId="streak-3" play={() => {}} onDismiss={bronze} />,
    );
    act(() => vi.advanceTimersByTime(3_500));
    expect(bronze).toHaveBeenCalledTimes(1);
    unmount();

    const platinum = vi.fn();
    render(<BadgeUnlocked badgeId="streak-365" play={() => {}} onDismiss={platinum} />);
    act(() => vi.advanceTimersByTime(3_500));
    expect(platinum).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(platinum).toHaveBeenCalledTimes(1);
  });

  it("does not break when the sound fails", () => {
    render(
      <BadgeUnlocked
        badgeId="streak-3"
        play={() => {
          throw new Error("no audio");
        }}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Warming Up" })).toBeInTheDocument();
  });
});

describe("every badge's unlock moment", () => {
  const EYEBROWS = {
    bronze: "Badge unlocked",
    silver: "Silver badge unlocked",
    gold: "Gold badge unlocked!",
    platinum: "Platinum badge unlocked!",
    secret: "Secret badge found!",
  } as const;

  it.each(BADGES.map((b) => [b.id, b] as const))("%s plays its tier's show", (id, badge) => {
    const play = vi.fn();
    render(<BadgeUnlocked badgeId={id} play={play} onDismiss={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: badge.name });
    expect(dialog).toHaveTextContent(EYEBROWS[badge.tier]);
    expect(dialog).toHaveTextContent(badge.description);
    expect(play).toHaveBeenCalledExactlyOnceWith(badge.tier);
  });
});

describe("badge fanfares", () => {
  it("get bigger with each tier", () => {
    const order = ["bronze", "silver", "gold", "platinum", "secret"] as const;
    const notes = order.map((tier) => FANFARES[tier].tones.length);
    const tails = order.map((tier) => FANFARES[tier].reverb);
    for (let i = 1; i < order.length - 1; i++) {
      expect(notes[i]!, order[i]).toBeGreaterThan(notes[i - 1]!);
      expect(tails[i]!, order[i]).toBeGreaterThan(tails[i - 1]!);
    }
    expect(tails[4]).toBeGreaterThanOrEqual(tails[3]!);
  });
});
