import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BossDto } from "@studyroom/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BossDefeated } from "../src/components/BossDefeated";
import { CLIPS } from "../src/lib/clips";
import { BOSS_SHOW } from "../src/lib/unlockShow";

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

afterEach(() => {
  vi.useRealTimers();
});

describe("BossDefeated", () => {
  it("names the boss and the loot, and moves on with the button", async () => {
    const onDismiss = vi.fn();
    render(<BossDefeated boss={boss} onDismiss={onDismiss} />);
    const dialog = screen.getByRole("dialog", { name: "The Procrastinator" });
    expect(dialog).toHaveTextContent("Boss defeated!");
    expect(dialog).toHaveTextContent("Everyone who pitched in earned +50 XP.");
    expect(screen.getByRole("button", { name: "Nice!" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Nice!" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("leaves out the loot when there is none", () => {
    render(<BossDefeated boss={{ ...boss, lootXp: 0 }} onDismiss={() => {}} />);
    expect(screen.getByRole("dialog")).not.toHaveTextContent("XP");
  });

  it("stays open until closed, then closes with Escape", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<BossDefeated boss={boss} onDismiss={onDismiss} />);
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "The Procrastinator" })).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("closes with a tap anywhere", async () => {
    const onDismiss = vi.fn();
    render(<BossDefeated boss={boss} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("dialog"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("lands inside its music", () => {
    expect(BOSS_SHOW.land).toBeLessThan(BOSS_SHOW.end);
    expect(BOSS_SHOW.end).toBeLessThanOrEqual(CLIPS.boss.seconds);
  });
});
