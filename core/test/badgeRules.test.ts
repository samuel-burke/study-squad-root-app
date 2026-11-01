import { describe, expect, it } from "vitest";
import {
  BADGES,
  newlyEarnedBadges,
  type BadgeFacts,
  type BadgeFeature,
  type BossFacts,
  type DayFacts,
  type LifetimeFacts,
  type SessionFacts,
  type StreakFacts,
} from "../src";

/**
 * One row per badge in the catalog: facts that just earn it, and facts that
 * just miss it. A badge added to the catalog without a row fails the first
 * test, so every badge always has its own check.
 */

const at = (day: string, hour: number, minute = 0) => ({ day, hour, minute });

/** A finished 25 minute solo session on a Wednesday afternoon. */
const session = (overrides: Partial<SessionFacts> = {}): Partial<BadgeFacts> => ({
  session: {
    kind: "solo",
    finished: true,
    minutes: 25,
    plannedMinutes: 25,
    combo: 1,
    start: at("2026-10-28", 14, 0),
    end: at("2026-10-28", 14, 25),
    fullCycle: false,
    ...overrides,
  },
});
const streak = (overrides: Partial<StreakFacts>): Partial<BadgeFacts> => ({
  streak: { length: 1, comebackFrom: 0, freezeSaved: false, ...overrides },
});
const today = (overrides: Partial<DayFacts>): Partial<BadgeFacts> => ({
  today: { day: "2026-10-28", focusMinutes: 0, sessionsFinished: 0, goalsDone: 0, ...overrides },
});
const lifetime = (overrides: Partial<LifetimeFacts>): Partial<BadgeFacts> => ({
  lifetime: {
    focusMinutes: 0,
    sessionsFinished: 0,
    roomRoundsFinished: 0,
    goalsDone: 0,
    ...overrides,
  },
});
/** A boss beaten by a group on Wednesday afternoon. */
const boss = (overrides: Partial<BossFacts>): Partial<BadgeFacts> => ({
  boss: {
    name: "Calc II",
    strength: 1,
    defeats: 1,
    contributors: 3,
    finalBlow: false,
    at: at("2026-10-28", 14),
    ...overrides,
  },
});
const quests = (doneThisWeek: number, totalDone: number, perWeek = 3): Partial<BadgeFacts> => ({
  quests: { doneThisWeek, perWeek, totalDone },
});
const rank = (value: number): Partial<BadgeFacts> => ({ leaderboard: { rank: value } });
const xp = (xpTotal: number): Partial<BadgeFacts> => ({ xpTotal });
const level = (value: number): Partial<BadgeFacts> => ({ level: value });

type Row = { earns: Partial<BadgeFacts>; misses: Partial<BadgeFacts> };

const RULES: Record<string, Row> = {
  "streak-3": { earns: streak({ length: 3 }), misses: streak({ length: 2 }) },
  "streak-7": { earns: streak({ length: 7 }), misses: streak({ length: 6 }) },
  "streak-14": { earns: streak({ length: 14 }), misses: streak({ length: 13 }) },
  "streak-30": { earns: streak({ length: 30 }), misses: streak({ length: 29 }) },
  "streak-50": { earns: streak({ length: 50 }), misses: streak({ length: 49 }) },
  "streak-100": { earns: streak({ length: 100 }), misses: streak({ length: 99 }) },
  "streak-200": { earns: streak({ length: 200 }), misses: streak({ length: 199 }) },
  "streak-365": { earns: streak({ length: 365 }), misses: streak({ length: 364 }) },
  comeback: { earns: streak({ comebackFrom: 2 }), misses: streak({ comebackFrom: 1 }) },
  "freeze-saved": { earns: streak({ freezeSaved: true }), misses: streak({ length: 5 }) },

  "level-5": { earns: level(5), misses: level(4) },
  "level-10": { earns: level(10), misses: level(9) },
  "level-20": { earns: level(20), misses: level(19) },
  "level-30": { earns: level(30), misses: level(29) },
  "level-50": { earns: level(50), misses: level(49) },

  "first-session": {
    earns: lifetime({ sessionsFinished: 1 }),
    misses: lifetime({ sessionsFinished: 0 }),
  },
  "focus-10h": { earns: lifetime({ focusMinutes: 600 }), misses: lifetime({ focusMinutes: 599 }) },
  "focus-50h": {
    earns: lifetime({ focusMinutes: 3000 }),
    misses: lifetime({ focusMinutes: 2999 }),
  },
  "focus-100h": {
    earns: lifetime({ focusMinutes: 6000 }),
    misses: lifetime({ focusMinutes: 5999 }),
  },
  "focus-250h": {
    earns: lifetime({ focusMinutes: 15000 }),
    misses: lifetime({ focusMinutes: 14999 }),
  },
  "focus-500h": {
    earns: lifetime({ focusMinutes: 30000 }),
    misses: lifetime({ focusMinutes: 29999 }),
  },
  "early-bird": {
    earns: session({ start: at("2026-10-28", 4), end: at("2026-10-28", 4, 25) }),
    misses: session({ start: at("2026-10-28", 8), end: at("2026-10-28", 8, 25) }),
  },
  "night-owl": {
    earns: session({ start: at("2026-10-28", 22), end: at("2026-10-28", 22, 25) }),
    misses: session({ start: at("2026-10-28", 21), end: at("2026-10-28", 21, 25) }),
  },
  marathon: { earns: today({ sessionsFinished: 4 }), misses: today({ sessionsFinished: 3 }) },
  "power-day": { earns: today({ focusMinutes: 240 }), misses: today({ focusMinutes: 239 }) },
  "weekend-warrior": {
    earns: today({ day: "2026-10-31", sessionsFinished: 3 }),
    misses: today({ day: "2026-10-30", sessionsFinished: 3 }),
  },
  "long-haul": {
    earns: session({ plannedMinutes: 90 }),
    misses: session({ kind: "room", plannedMinutes: 90 }),
  },
  ultramarathon: {
    earns: session({ plannedMinutes: 180 }),
    misses: session({ plannedMinutes: 179 }),
  },

  "squad-up": {
    earns: lifetime({ roomRoundsFinished: 1 }),
    misses: lifetime({ sessionsFinished: 1 }),
  },
  "room-25": {
    earns: lifetime({ roomRoundsFinished: 25 }),
    misses: lifetime({ roomRoundsFinished: 24 }),
  },
  "room-100": {
    earns: lifetime({ roomRoundsFinished: 100 }),
    misses: lifetime({ roomRoundsFinished: 99 }),
  },
  "full-cycle": {
    earns: session({ kind: "room", fullCycle: true }),
    misses: session({ kind: "room", fullCycle: true, finished: false }),
  },
  "study-group": {
    earns: session({ kind: "room", combo: 1.5 }),
    misses: session({ kind: "room", combo: 1.4 }),
  },
  "full-house": {
    earns: session({ kind: "room", combo: 2 }),
    misses: session({ kind: "room", combo: 1.9 }),
  },

  "first-goal": { earns: lifetime({ goalsDone: 1 }), misses: lifetime({ goalsDone: 0 }) },
  "goals-25": { earns: lifetime({ goalsDone: 25 }), misses: lifetime({ goalsDone: 24 }) },
  "goals-100": { earns: lifetime({ goalsDone: 100 }), misses: lifetime({ goalsDone: 99 }) },
  "productive-day": { earns: today({ goalsDone: 5 }), misses: today({ goalsDone: 4 }) },

  "first-boss": { earns: boss({ defeats: 1 }), misses: {} },
  "boss-5": { earns: boss({ defeats: 5 }), misses: boss({ defeats: 4 }) },
  "boss-20": { earns: boss({ defeats: 20 }), misses: boss({ defeats: 19 }) },
  "final-blow": { earns: boss({ finalBlow: true }), misses: boss({ finalBlow: false }) },
  "giant-slayer": { earns: boss({ strength: 2 }), misses: boss({ strength: 1.9 }) },
  "survived-finals": {
    earns: boss({ name: "The Final Final Exam" }),
    misses: boss({ name: "Finals" }),
  },

  "quest-first": { earns: quests(1, 1), misses: quests(0, 0) },
  "quest-sweep": { earns: quests(3, 3), misses: quests(2, 10) },
  "quest-25": { earns: quests(1, 25), misses: quests(1, 24) },

  podium: { earns: rank(3), misses: rank(4) },
  "pole-position": { earns: rank(1), misses: rank(2) },

  "three-am": {
    earns: session({ start: at("2026-10-28", 3), end: at("2026-10-28", 3, 25) }),
    misses: session({ start: at("2026-10-28", 2), end: at("2026-10-28", 2, 25) }),
  },
  "midnight-oil": {
    earns: session({ start: at("2026-10-28", 23, 50), end: at("2026-10-29", 0, 15) }),
    misses: session({ start: at("2026-10-28", 23, 0), end: at("2026-10-28", 23, 25) }),
  },
  leet: {
    earns: session({ start: at("2026-10-28", 13, 12), end: at("2026-10-28", 13, 37) }),
    misses: session({ start: at("2026-10-28", 13, 13), end: at("2026-10-28", 13, 38) }),
  },
  "deep-thought": {
    earns: session({ plannedMinutes: 42 }),
    misses: session({ kind: "room", plannedMinutes: 42 }),
  },
  "pi-day": {
    earns: session({ start: at("2027-03-14", 14), end: at("2027-03-14", 14, 25) }),
    misses: session({ start: at("2027-03-15", 14), end: at("2027-03-15", 14, 25) }),
  },
  "longest-day": {
    earns: session({ start: at("2027-06-21", 14), end: at("2027-06-21", 14, 25) }),
    misses: session({ start: at("2027-06-22", 14), end: at("2027-06-22", 14, 25) }),
  },
  "new-year": {
    earns: session({ start: at("2027-01-01", 14), end: at("2027-01-01", 14, 25) }),
    misses: session({ start: at("2027-01-02", 14), end: at("2027-01-02", 14, 25) }),
  },
  "leap-day": {
    earns: session({ start: at("2028-02-29", 14), end: at("2028-02-29", 14, 25) }),
    misses: session({ start: at("2028-02-28", 14), end: at("2028-02-28", 14, 25) }),
  },
  "st-patricks": {
    earns: session({ start: at("2027-03-17", 14), end: at("2027-03-17", 14, 25) }),
    misses: session({ start: at("2027-03-18", 14), end: at("2027-03-18", 14, 25) }),
  },
  unstoppable: { earns: today({ sessionsFinished: 8 }), misses: today({ sessionsFinished: 7 }) },
  speedrun: { earns: { goal: { secondsOpen: 59 } }, misses: { goal: { secondsOpen: 60 } } },
  jackpot: { earns: xp(1777), misses: xp(1778) },
  "over-9000": { earns: xp(9001), misses: xp(9000) },
  phoenix: { earns: streak({ comebackFrom: 30 }), misses: streak({ comebackFrom: 29 }) },
  "one-person-army": { earns: boss({ contributors: 1 }), misses: boss({ contributors: 2 }) },
  blitz: {
    earns: boss({ at: at("2026-10-26", 9) }),
    misses: boss({ at: at("2026-10-27", 9) }),
  },
  "buzzer-beater": {
    earns: boss({ at: at("2026-11-01", 20) }),
    misses: boss({ at: at("2026-11-01", 19, 59) }),
  },
  "thesis-defended": {
    earns: boss({ name: "The Thesis Defense" }),
    misses: boss({ name: "Thesis" }),
  },
  "do-not-disturb": {
    earns: boss({ name: "Notification Hydra" }),
    misses: boss({ name: "Hydra" }),
  },
  "wide-awake": {
    earns: boss({ name: "Captain Snooze Button" }),
    misses: boss({ name: "Snooze" }),
  },
};

const ALL_FEATURES: ReadonlySet<BadgeFeature> = new Set(["quests", "leaderboard", "bossRoster"]);

const earned = (facts: Partial<BadgeFacts>) =>
  newlyEarnedBadges({ xpTotal: 0, level: 1, ...facts }, new Set(), ALL_FEATURES);

describe("every badge's own rule", () => {
  it("has a row for every badge in the catalog, and none for badges that don't exist", () => {
    expect(Object.keys(RULES).sort()).toEqual(BADGES.map((b) => b.id).sort());
  });

  it.each(BADGES.map((b) => [b.id, b] as const))("%s", (id, badge) => {
    const row = RULES[id]!;
    expect(badge.earned({ xpTotal: 0, level: 1, ...row.earns }), "just earns it").toBe(true);
    expect(badge.earned({ xpTotal: 0, level: 1, ...row.misses }), "just misses it").toBe(false);
    // Through the same path the engine uses.
    expect(earned(row.earns)).toContain(id);
    expect(earned(row.misses)).not.toContain(id);
    expect(
      newlyEarnedBadges({ xpTotal: 0, level: 1, ...row.earns }, new Set([id]), ALL_FEATURES),
    ).not.toContain(id);
  });
});
