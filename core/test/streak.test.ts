import { describe, expect, it } from "vitest";
import {
  currentStreak,
  EMPTY_STREAK,
  freezeAvailable,
  recordActiveDay,
  type StreakState,
} from "../src";

const days = (state: StreakState, list: string[], freezes = true) =>
  list.reduce((s, day) => recordActiveDay(s, day, freezes).state, state);

describe("recordActiveDay", () => {
  it("starts a streak on the first active day", () => {
    const update = recordActiveDay(EMPTY_STREAK, "2026-10-28", true);
    expect(update.state.streak).toBe(1);
    expect(update.extended).toBe(true);
  });

  it("counts a day once no matter how many sessions", () => {
    const once = recordActiveDay(EMPTY_STREAK, "2026-10-28", true).state;
    const twice = recordActiveDay(once, "2026-10-28", true);
    expect(twice.state.streak).toBe(1);
    expect(twice.extended).toBe(false);
  });

  it("grows on consecutive days", () => {
    expect(days(EMPTY_STREAK, ["2026-10-26", "2026-10-27", "2026-10-28"]).streak).toBe(3);
  });

  it("spends the week's freeze to bridge a single missed day", () => {
    const before = days(EMPTY_STREAK, ["2026-10-26", "2026-10-27"]);
    const update = recordActiveDay(before, "2026-10-29", true); // missed the 28th
    expect(update.state.streak).toBe(3);
    expect(update.freezesSpent).toBe(1);
    expect(update.state.freezeWeeksUsed).toEqual(["2026-10-26"]);
  });

  it("can't use the same week's freeze twice", () => {
    const state = days(EMPTY_STREAK, ["2026-10-26", "2026-10-28"]); // freeze spent on the 27th
    expect(recordActiveDay(state, "2026-10-30", true).state.streak).toBe(1);
  });

  it("bridges a two-day gap only when it spans two weeks with unused freezes", () => {
    // Missed Sunday 11-01 (week of 10-26) and Monday 11-02 (week of 11-02).
    const state = days(EMPTY_STREAK, ["2026-10-30", "2026-10-31"]);
    const update = recordActiveDay(state, "2026-11-03", true);
    expect(update.state.streak).toBe(3);
    expect(update.freezesSpent).toBe(2);
  });

  it("resets after a gap freezes can't cover", () => {
    const state = days(EMPTY_STREAK, ["2026-10-26", "2026-10-27"]);
    expect(recordActiveDay(state, "2026-10-30", true).state.streak).toBe(1);
  });

  it("resets on any gap when freezes are turned off", () => {
    const state = days(EMPTY_STREAK, ["2026-10-26", "2026-10-27"], false);
    expect(recordActiveDay(state, "2026-10-29", false).state.streak).toBe(1);
  });

  it("never shortens a streak if the clock goes backwards", () => {
    const state = days(EMPTY_STREAK, ["2026-10-27", "2026-10-28"]);
    const update = recordActiveDay(state, "2026-10-26", true);
    expect(update.state).toBe(state);
  });

  it("keeps only recent freeze history", () => {
    let state = EMPTY_STREAK;
    let day = "2026-01-05";
    for (let week = 0; week < 12; week++) {
      state = days(state, [day, addTwo(day)]); // every week skips a day and spends a freeze
      day = addSeven(day);
    }
    expect(state.freezeWeeksUsed.length).toBeLessThanOrEqual(8);
  });
});

describe("currentStreak", () => {
  const state = days(EMPTY_STREAK, ["2026-10-26", "2026-10-27"]);

  it("shows the streak today and yesterday", () => {
    expect(currentStreak(state, "2026-10-27", true)).toBe(2);
    expect(currentStreak(state, "2026-10-28", true)).toBe(2);
  });

  it("stays alive one more day when a freeze can cover it", () => {
    expect(currentStreak(state, "2026-10-29", true)).toBe(2);
    expect(currentStreak(state, "2026-10-29", false)).toBe(0);
  });

  it("drops to zero when the gap can't be covered", () => {
    expect(currentStreak(state, "2026-10-30", true)).toBe(0);
    expect(currentStreak(EMPTY_STREAK, "2026-10-30", true)).toBe(0);
  });
});

describe("freezeAvailable", () => {
  it("is available until this week's freeze is spent", () => {
    expect(freezeAvailable(EMPTY_STREAK, "2026-10-28", true)).toBe(true);
    const spent = days(EMPTY_STREAK, ["2026-10-26", "2026-10-28"]);
    expect(freezeAvailable(spent, "2026-10-28", true)).toBe(false);
    expect(freezeAvailable(spent, "2026-11-02", true)).toBe(true);
    expect(freezeAvailable(EMPTY_STREAK, "2026-10-28", false)).toBe(false);
  });

  it("counts this week's freeze as used while it is covering a missed day", () => {
    // Studied Thu-Sun, skipped Monday, opened the app on Tuesday.
    const thuToSun = days(EMPTY_STREAK, ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
    expect(currentStreak(thuToSun, "2026-11-10", true)).toBe(4);
    expect(freezeAvailable(thuToSun, "2026-11-10", true)).toBe(false);
    // Monday itself: nothing missed yet, so the freeze is still there.
    expect(freezeAvailable(thuToSun, "2026-11-09", true)).toBe(true);
    // Missing Tuesday too is more than one freeze can cover.
    expect(currentStreak(thuToSun, "2026-11-11", true)).toBe(0);
  });

  it("keeps this week's freeze when the missed day was last week", () => {
    // Studied Saturday, skipped Sunday, opened the app on Monday.
    const sat = days(EMPTY_STREAK, ["2026-11-07"]);
    expect(currentStreak(sat, "2026-11-09", true)).toBe(1);
    expect(freezeAvailable(sat, "2026-11-09", true)).toBe(true);
  });
});

function addTwo(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 2);
  return d.toISOString().slice(0, 10);
}
function addSeven(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}
