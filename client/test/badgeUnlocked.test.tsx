import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BADGES } from "@studyroom/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BadgeMedal } from "../src/components/BadgeMedal";
import { BadgeUnlocked, medalImage } from "../src/components/BadgeUnlocked";
import * as clips from "../src/lib/clips";
import { CLIPS } from "../src/lib/clips";
import { SHOWS } from "../src/lib/unlockShow";

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

  it("stays open until closed, however long the show runs, then closes with Escape", () => {
    vi.useFakeTimers();
    const play = vi.fn();
    const onDismiss = vi.fn();
    render(<BadgeUnlocked badgeId="streak-365" play={play} onDismiss={onDismiss} />);
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("Platinum badge unlocked!");
    // The music plays once, not again while the moment waits.
    expect(play).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("closes with a tap anywhere, once per tap", async () => {
    const onDismiss = vi.fn();
    render(<BadgeUnlocked badgeId="streak-3" play={() => {}} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("dialog"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Nice!" }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it("fades its music out when the moment closes early", async () => {
    const stop = vi.fn();
    const { unmount } = render(
      <BadgeUnlocked badgeId="streak-365" play={() => stop} onDismiss={() => {}} />,
    );
    expect(stop).not.toHaveBeenCalled();
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("replays the whole moment with the Replay link, without closing it", async () => {
    const stop = vi.fn();
    const play = vi.fn(() => stop);
    const onDismiss = vi.fn();
    render(<BadgeUnlocked badgeId="focus-100h" play={play} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(2);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Centurion" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nice!" })).toHaveFocus();
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

  it.each(BADGES.filter((b) => !b.ring).map((b) => [b.id, b] as const))(
    "%s plays its tier's show",
    (id, badge) => {
      const play = vi.fn();
      render(<BadgeUnlocked badgeId={id} play={play} onDismiss={() => {}} />);
      const dialog = screen.getByRole("dialog", { name: badge.name });
      expect(dialog).toHaveTextContent(EYEBROWS[badge.tier]);
      expect(dialog).toHaveTextContent(badge.description);
      expect(play).toHaveBeenCalledExactlyOnceWith(badge.tier);
    },
  );
});

describe("color tier ring unlock", () => {
  it.each(BADGES.filter((b) => b.ring).map((b) => [b.id, b] as const))(
    "%s gets the neon ring unlock with its hum",
    async (id, badge) => {
      const hum = vi.spyOn(clips, "playSound").mockReturnValue(() => {});
      const onDismiss = vi.fn();
      render(<BadgeUnlocked badgeId={id} onDismiss={onDismiss} />);
      const dialog = screen.getByRole("dialog", { name: badge.name });
      expect(dialog).toHaveTextContent("New color unlocked");
      expect(dialog).toHaveTextContent(badge.description);
      expect(hum).toHaveBeenCalledTimes(1);
      await userEvent.click(screen.getByRole("button", { name: "Nice!" }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
      hum.mockRestore();
    },
  );

  it("replays the ring and its hum with the Replay link", async () => {
    const stop = vi.fn();
    const hum = vi.spyOn(clips, "playSound").mockReturnValue(stop);
    const onDismiss = vi.fn();
    render(<BadgeUnlocked badgeId="tier-blaze" onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(hum).toHaveBeenCalledTimes(2);
    expect(onDismiss).not.toHaveBeenCalled();
    hum.mockRestore();
  });

  it("stays quiet when sounds are muted", () => {
    const hum = vi.spyOn(clips, "playSound").mockReturnValue(() => {});
    render(<BadgeUnlocked badgeId="tier-blaze" muted onDismiss={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Blaze" })).toBeInTheDocument();
    expect(hum).not.toHaveBeenCalled();
    hum.mockRestore();
  });
});

describe("tier shows", () => {
  const order = ["bronze", "silver", "gold", "platinum", "secret"] as const;

  it("land inside their music", () => {
    for (const tier of order) {
      const show = SHOWS[tier];
      expect(show.land, tier).toBeLessThan(show.end);
      expect(show.end, tier).toBeLessThanOrEqual(CLIPS[tier].seconds);
    }
  });

  it("never get shorter for a rarer tier", () => {
    for (let i = 1; i < order.length; i++) {
      expect(SHOWS[order[i]!].end, order[i]).toBeGreaterThanOrEqual(SHOWS[order[i - 1]!].end);
    }
  });
});

describe("medalImage", () => {
  it("leaves the platinum glints off the 3D medal but keeps them on the card", () => {
    const { container } = render(<BadgeMedal badge={BADGES.find((b) => b.id === "streak-365")!} />);
    const svg = container.querySelector("svg")!;
    expect(svg.querySelector(".medal-glints")).not.toBeNull();
    const art = decodeURIComponent(medalImage(svg).src);
    expect(art).not.toContain("medal-glints");
    expect(art).toContain("medal-glyph");
  });
});
