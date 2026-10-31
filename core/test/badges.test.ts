import { describe, expect, it } from "vitest";
import {
  automaticCardStyle,
  availableBadges,
  BADGES,
  badgeById,
  CARD_STYLES,
  localTime,
  newlyEarnedBadges,
  resolveCardStyle,
  resolveShowcase,
  type BadgeFacts,
  type BadgeFeature,
  type SessionFacts,
} from "../src";

const at = (day: string, hour: number, minute = 0) => ({ day, hour, minute });

/** A finished 25 minute solo session on a Wednesday afternoon. */
function session(overrides: Partial<SessionFacts> = {}): SessionFacts {
  return {
    kind: "solo",
    finished: true,
    minutes: 25,
    plannedMinutes: 25,
    combo: 1,
    start: at("2026-10-28", 14, 0),
    end: at("2026-10-28", 14, 25),
    fullCycle: false,
    ...overrides,
  };
}

const ALL_FEATURES: ReadonlySet<BadgeFeature> = new Set(["quests", "leaderboard", "bossRoster"]);

/** Badges these facts earn from scratch, with every feature switched on. */
function earned(facts: Partial<BadgeFacts>): string[] {
  return newlyEarnedBadges({ xpTotal: 0, level: 1, ...facts }, new Set(), ALL_FEATURES);
}

describe("badge catalog", () => {
  it("has unique ids, names and medals, with text for every badge", () => {
    const medals = BADGES.map((b) => `${b.glyph}/${b.tier}/${b.stamp ?? ""}`);
    expect(new Set(medals).size).toBe(medals.length);
    for (const key of ["id", "name"] as const) {
      const values = BADGES.map((b) => b[key]);
      expect(new Set(values).size, key).toBe(values.length);
    }
    for (const badge of BADGES) {
      expect(badge.id).toMatch(/^[a-z0-9-]+$/);
      expect(badge.description.length).toBeGreaterThan(0);
      // Secret badges, and only those, wear the secret medal.
      expect(badge.tier === "secret", badge.id).toBe(badge.secret === true);
      expect((badge.stamp ?? "").length, badge.id).toBeLessThanOrEqual(4);
    }
  });

  it("is big, with plenty of secrets", () => {
    expect(BADGES.length).toBeGreaterThanOrEqual(60);
    expect(BADGES.filter((b) => b.secret).length).toBeGreaterThanOrEqual(20);
  });

  it("files every secret badge under secrets, and nothing else there", () => {
    for (const badge of BADGES) expect(badge.secret === true).toBe(badge.category === "secret");
  });

  it("includes the badges the issue asked for", () => {
    for (const id of ["early-bird", "night-owl", "marathon", "comeback", "first-boss"]) {
      expect(badgeById(id), id).toBeDefined();
    }
  });

  it("leaves out badges for features this build doesn't have", () => {
    const ids = availableBadges(new Set()).map((b) => b.id);
    expect(ids).not.toContain("quest-first");
    expect(availableBadges().map((b) => b.id)).toContain("quest-first");
    expect(ids).not.toContain("pole-position");
    expect(ids).not.toContain("giant-slayer");
    expect(ids).toContain("first-boss");
    expect(availableBadges(ALL_FEATURES)).toHaveLength(BADGES.length);
    expect(
      newlyEarnedBadges(
        { xpTotal: 0, level: 1, quests: { doneThisWeek: 3, perWeek: 3, totalDone: 30 } },
        new Set(),
        new Set(),
      ),
    ).toEqual([]);
  });

  it("never awards a badge twice", () => {
    const facts = { xpTotal: 0, level: 5 };
    expect(newlyEarnedBadges(facts, new Set(), ALL_FEATURES)).toEqual(["level-5"]);
    expect(newlyEarnedBadges(facts, new Set(["level-5"]), ALL_FEATURES)).toEqual([]);
  });
});

describe("badge rules", () => {
  it("Early Bird and Night Owl go by when the session starts", () => {
    expect(earned({ session: session({ start: at("2026-10-28", 7, 59) }) })).toContain(
      "early-bird",
    );
    expect(earned({ session: session({ start: at("2026-10-28", 8, 0) }) })).not.toContain(
      "early-bird",
    );
    expect(earned({ session: session({ start: at("2026-10-28", 22, 0) }) })).toContain("night-owl");
    const late = earned({ session: session({ start: at("2026-10-28", 3, 10) }) });
    expect(late).toEqual(expect.arrayContaining(["night-owl", "three-am"]));
    expect(late).not.toContain("early-bird");
  });

  it("needs a finished session for time-of-day badges", () => {
    const facts = { session: session({ finished: false, start: at("2026-10-28", 6, 0) }) };
    expect(earned(facts)).not.toContain("early-bird");
  });

  it("Marathon, Power Day and Weekend Warrior read today's totals", () => {
    const today = { day: "2026-10-28", focusMinutes: 240, sessionsFinished: 4, goalsDone: 0 };
    expect(earned({ today })).toEqual(expect.arrayContaining(["marathon", "power-day"]));
    expect(earned({ today })).not.toContain("weekend-warrior");
    expect(earned({ today: { ...today, day: "2026-10-31", sessionsFinished: 3 } })).toContain(
      "weekend-warrior",
    );
    expect(earned({ today: { ...today, sessionsFinished: 8 } })).toContain("unstoppable");
  });

  it("lifetime badges count focus hours, room rounds and goals", () => {
    const lifetime = {
      focusMinutes: 600,
      sessionsFinished: 1,
      roomRoundsFinished: 25,
      goalsDone: 1,
    };
    expect(earned({ lifetime })).toEqual(
      expect.arrayContaining(["first-session", "focus-10h", "squad-up", "room-25", "first-goal"]),
    );
    expect(earned({ lifetime: { ...lifetime, focusMinutes: 599 } })).not.toContain("focus-10h");
  });

  it("streak badges, Comeback, Phoenix and the freeze", () => {
    expect(earned({ streak: { length: 7, comebackFrom: 0, freezeSaved: false } })).toEqual([
      "streak-3",
      "streak-7",
    ]);
    expect(earned({ streak: { length: 1, comebackFrom: 4, freezeSaved: false } })).toEqual([
      "comeback",
    ]);
    expect(earned({ streak: { length: 1, comebackFrom: 1, freezeSaved: false } })).toEqual([]);
    expect(earned({ streak: { length: 1, comebackFrom: 30, freezeSaved: true } })).toEqual(
      expect.arrayContaining(["comeback", "phoenix", "freeze-saved"]),
    );
  });

  it("room badges need a finished round at a high enough combo", () => {
    expect(earned({ session: session({ kind: "room", combo: 1.4 }) })).not.toContain("study-group");
    expect(earned({ session: session({ kind: "room", combo: 1.5 }) })).toContain("study-group");
    expect(earned({ session: session({ kind: "room", combo: 2, fullCycle: true }) })).toEqual(
      expect.arrayContaining(["study-group", "full-house", "full-cycle"]),
    );
  });

  it("solo timer lengths: Long Haul, Ultramarathon and 42 minutes", () => {
    expect(earned({ session: session({ plannedMinutes: 90 }) })).toContain("long-haul");
    expect(earned({ session: session({ plannedMinutes: 180 }) })).toContain("ultramarathon");
    expect(earned({ session: session({ plannedMinutes: 42 }) })).toEqual(["deep-thought"]);
    expect(earned({ session: session({ kind: "room", plannedMinutes: 42 }) })).toEqual([]);
  });

  it("hides Easter eggs in the calendar and the clock", () => {
    const on = (day: string, hour = 14, minute = 0) =>
      earned({ session: session({ start: at(day, hour, minute), end: at(day, hour, minute) }) });
    expect(on("2027-03-14")).toEqual(["pi-day"]);
    expect(on("2027-06-21")).toEqual(["longest-day"]);
    expect(on("2026-10-31")).toEqual([]);
    expect(on("2027-01-01")).toEqual(["new-year"]);
    expect(on("2028-02-29")).toEqual(["leap-day"]);
    expect(on("2027-03-17")).toEqual(["st-patricks"]);
    expect(on("2027-03-16")).toEqual([]);
    expect(on("2026-10-28", 13, 37)).toEqual(["leet"]);
    const overnight = session({ start: at("2026-10-28", 23, 40), end: at("2026-10-29", 0, 5) });
    expect(earned({ session: overnight })).toContain("midnight-oil");
  });

  it("XP Easter eggs: a total ending in 777, and over 9000", () => {
    expect(earned({ xpTotal: 777 })).toEqual(["jackpot"]);
    expect(earned({ xpTotal: 2777 })).toEqual(["jackpot"]);
    expect(earned({ xpTotal: 778 })).toEqual([]);
    expect(earned({ xpTotal: 1077 })).toEqual([]);
    expect(earned({ xpTotal: 9001 })).toEqual(["over-9000"]);
  });

  it("Speedrun is a goal finished within a minute", () => {
    expect(earned({ goal: { secondsOpen: 59 } })).toEqual(["speedrun"]);
    expect(earned({ goal: { secondsOpen: 60 } })).toEqual([]);
  });

  it("boss badges: counts, the final blow, strength and secret names", () => {
    const boss = {
      name: "Midterms",
      strength: 1,
      defeats: 1,
      contributors: 4,
      finalBlow: false,
      at: at("2026-10-28", 15),
    };
    expect(earned({ boss })).toEqual(["first-boss"]);
    expect(earned({ boss: { ...boss, defeats: 5, finalBlow: true } })).toEqual(
      expect.arrayContaining(["first-boss", "boss-5", "final-blow"]),
    );
    expect(earned({ boss: { ...boss, contributors: 1 } })).toContain("one-person-army");
    expect(earned({ boss: { ...boss, at: at("2026-10-26", 9) } })).toContain("blitz");
    expect(earned({ boss: { ...boss, at: at("2026-11-01", 20) } })).toContain("buzzer-beater");
    expect(earned({ boss: { ...boss, at: at("2026-11-01", 19) } })).not.toContain("buzzer-beater");
    expect(earned({ boss: { ...boss, name: "The Final Final Exam", strength: 2 } })).toEqual(
      expect.arrayContaining(["giant-slayer", "survived-finals"]),
    );
    expect(earned({ boss: { ...boss, name: "The Thesis Defense" } })).toContain("thesis-defended");
  });

  it("quest and leaderboard badges, once those features exist", () => {
    expect(earned({ quests: { doneThisWeek: 3, perWeek: 3, totalDone: 3 } })).toEqual([
      "quest-first",
      "quest-sweep",
    ]);
    expect(earned({ leaderboard: { rank: 3 } })).toEqual(["podium"]);
    expect(earned({ leaderboard: { rank: 1 } })).toEqual(["podium", "pole-position"]);
    expect(earned({ leaderboard: { rank: 0 } })).toEqual([]);
  });
});

describe("card styles", () => {
  it("only unlock with badges that exist, and level styles get fancier", () => {
    for (const style of CARD_STYLES) {
      if ("badge" in style.unlock) expect(badgeById(style.unlock.badge), style.id).toBeDefined();
    }
    const levels = CARD_STYLES.flatMap((s) => ("level" in s.unlock ? [s.unlock.level] : []));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(CARD_STYLES.map((s) => s.id)).size).toBe(CARD_STYLES.length);
  });

  it("picks the best level style automatically: gold border at level 8", () => {
    expect(automaticCardStyle(1)).toBe("classic");
    expect(automaticCardStyle(7)).toBe("ember");
    expect(automaticCardStyle(8)).toBe("gold");
    expect(automaticCardStyle(40)).toBe("legend");
  });

  it("falls back to automatic when the chosen style is locked or unknown", () => {
    expect(resolveCardStyle("gold", 8, new Set())).toBe("gold");
    expect(resolveCardStyle("lagoon", 8, new Set())).toBe("lagoon");
    expect(resolveCardStyle("legend", 8, new Set())).toBe("gold");
    expect(resolveCardStyle("midnight", 2, new Set())).toBe("classic");
    expect(resolveCardStyle("midnight", 2, new Set(["night-owl"]))).toBe("midnight");
    expect(resolveCardStyle("nope", 3, new Set())).toBe("lagoon");
    expect(resolveCardStyle(null, 3, new Set())).toBe("lagoon");
  });

  it("shows the picked badge, or the most recent", () => {
    const earnedList = ["a", "b", "c", "d"].map((badgeId) => ({ badgeId }));
    expect(resolveShowcase(null, earnedList)).toEqual(["d"]);
    expect(resolveShowcase(["a"], earnedList)).toEqual(["a"]);
    expect(resolveShowcase(["zzz"], earnedList)).toEqual(["d"]);
    expect(resolveShowcase(null, [])).toEqual([]);
  });
});

describe("localTime", () => {
  it("gives the wall clock in the community time zone", () => {
    // 2026-10-28 03:30 UTC is 23:30 the day before in New York.
    expect(localTime(Date.UTC(2026, 9, 28, 3, 30), "America/New_York")).toEqual({
      day: "2026-10-27",
      hour: 23,
      minute: 30,
    });
  });
});
