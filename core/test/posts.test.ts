import { describe, expect, it } from "vitest";
import {
  bossDefeatedPost,
  busyRoomPost,
  dailyRecapPost,
  squadPost,
  streakMilestonePost,
} from "../src";

describe("channel posts", () => {
  it("addresses squad bot posts to the room", () => {
    expect(squadPost("breakStarted", "Take five. 🧠", ["@Ana", "@Kai"], 2)).toBe(
      "@Ana @Kai Take five. 🧠",
    );
  });

  it("reminds the room to keep going when the session is done", () => {
    expect(squadPost("sessionCompleted", "That's a wrap.", ["@Ana"], 1)).toBe(
      "@Ana That's a wrap. Tap Keep going in Study Squad to roll into the next cycle.",
    );
  });

  it("sums up a big room instead of mentioning everyone", () => {
    const mentions = Array.from({ length: 12 }, (_, i) => `@m${i}`);
    const post = squadPost("breakStarted", "Break!", mentions, 12);
    expect(post).toContain("@m9 and 2 others Break!");
    expect(post).not.toContain("@m10");
  });

  it("announces a busy room", () => {
    expect(busyRoomPost(6, 1.5)).toContain("6 people are focusing right now. Combo is at 1.5x.");
  });

  it("celebrates streak milestones", () => {
    expect(streakMilestonePost("Ana R.", 30)).toBe("🔥 Ana R. just hit a 30 day streak.");
  });

  it("announces boss defeats with or without loot", () => {
    expect(bossDefeatedPost("Midterms", 12, 50)).toContain(
      "12 people dealt damage this week. Everyone who pitched in earned +50 XP.",
    );
    expect(bossDefeatedPost("Midterms", 1, 0)).not.toContain("XP");
  });

  it("writes the daily recap like the design", () => {
    const text = dailyRecapPost(
      {
        day: "2026-10-27",
        weekday: "Tuesday",
        focusMinutes: 41.5 * 60,
        goalsDone: 23,
        activeMembers: 14,
        boss: { name: "Midterms", hpLeftXp: 6840, daysLeft: 4, defeated: false },
        topStreaks: [
          { userId: "p", streak: 54 },
          { userId: "a", streak: 31 },
          { userId: "missing", streak: 17 },
        ],
        topFocus: [],
      },
      new Map([
        ["p", "Priya"],
        ["a", "Ana R."],
      ]),
    );
    expect(text).toBe(
      [
        "Tuesday recap",
        "41.5 hrs focused as a community · 23 goals finished · 14 members showed up",
        "Midterms: down to 6,840 HP · 4 days left",
        "Top streaks: Priya 54 · Ana R. 31 · Someone 17",
      ].join("\n"),
    );
  });

  it("leaves out the boss and streak lines when there's nothing to show", () => {
    const text = dailyRecapPost(
      {
        day: "d",
        weekday: "Monday",
        focusMinutes: 30,
        goalsDone: 1,
        activeMembers: 1,
        boss: null,
        topStreaks: [],
        topFocus: [],
      },
      new Map(),
    );
    expect(text.split("\n")).toHaveLength(2);
  });

  it("lists the week's top focusers when the recap carries them", () => {
    const text = dailyRecapPost(
      {
        day: "2026-10-28",
        weekday: "Wednesday",
        focusMinutes: 300,
        goalsDone: 0,
        activeMembers: 3,
        boss: null,
        topStreaks: [],
        topFocus: [
          { userId: "p", focusMinutes: 312 },
          { userId: "a", focusMinutes: 60 },
          { userId: "missing", focusMinutes: 45 },
        ],
      },
      new Map([
        ["p", "Priya"],
        ["a", "Ana R."],
      ]),
    );
    expect(text.split("\n").at(-1)).toBe(
      "This week: 1. Priya 5.2 hrs · 2. Ana R. 1 hr · 3. Someone 45 min",
    );
  });
});
