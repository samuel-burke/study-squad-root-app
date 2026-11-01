import { describe, expect, it } from "vitest";
import {
  ALL_PERSONALITIES,
  moodForTurn,
  MOVIE_LINES,
  pickSquadLine,
  RARE_LINES,
  SQUAD_LINES,
  squadHeading,
  squadMoods,
  type SquadEvent,
} from "../src";
import { seededRandom } from "./helpers";

const EVENTS = Object.keys(SQUAD_LINES) as SquadEvent[];
const context = { round: 2, togetherMinutes: 30 };
describe("squad bot lines", () => {
  it("gives every personality lines for every event", () => {
    for (const event of EVENTS) {
      for (const p of ALL_PERSONALITIES) {
        expect(SQUAD_LINES[event][p].length, `${event} ${p}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("keeps lines short and free of mention markup", () => {
    const all = [
      ...EVENTS.flatMap((e) => ALL_PERSONALITIES.flatMap((p) => SQUAD_LINES[e][p])),
      ...RARE_LINES.map((l) => l.text),
    ];
    for (const line of all) {
      expect(line.length, line).toBeLessThanOrEqual(90);
      expect(line, line).not.toMatch(/[@[\]]/);
    }
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("squad moods", () => {
  it("takes turns through the enabled personalities, then movie lines", () => {
    expect(squadMoods(["chill", "meme"])).toEqual(["chill", "meme", "movie"]);
    expect(squadMoods([])).toEqual([...ALL_PERSONALITIES, "movie"]);
    const turns = Array.from({ length: 7 }, (_, t) => moodForTurn(["chill", "meme"], t));
    expect(turns).toEqual(["chill", "meme", "movie", "chill", "meme", "movie", "chill"]);
  });
});

describe("pickSquadLine", () => {
  const TIMER_EVENTS = EVENTS.filter((e) => e !== "memberJoined" && e !== "badgeUnlocked");

  it("only uses the mood's own lines", () => {
    for (const event of EVENTS) {
      for (let i = 0; i < 20; i++) {
        const line = pickSquadLine(event, "chill", {}, () => i / 20, context);
        expect(line.id.startsWith(`${event}.chill.`), line.id).toBe(true);
        expect(line.rare).toBe(false);
      }
    }
  });

  it("gives every line in a mood the same chance", () => {
    const random = seededRandom(11);
    const counts = new Map<string, number>();
    const runs = 12_000;
    for (let i = 0; i < runs; i++) {
      const line = pickSquadLine("breakStarted", "drill", {}, random, context);
      counts.set(line.id, (counts.get(line.id) ?? 0) + 1);
    }
    const expected = runs / SQUAD_LINES.breakStarted.drill.length;
    expect(counts.size).toBe(SQUAD_LINES.breakStarted.drill.length);
    for (const n of counts.values()) {
      expect(n).toBeGreaterThan(expected * 0.9);
      expect(n).toBeLessThan(expected * 1.1);
    }
  });

  it("uses only movie lines for timer posts in the movie mood, each as likely", () => {
    const random = seededRandom(5);
    const counts = new Map<string, number>();
    const runs = 12_000;
    for (let i = 0; i < runs; i++) {
      const line = pickSquadLine("studyResumed", "movie", {}, random, {
        round: 1,
        togetherMinutes: 150,
      });
      expect(line.rare).toBe(true);
      counts.set(line.id, (counts.get(line.id) ?? 0) + 1);
    }
    expect(counts.size).toBe(RARE_LINES.length);
    const expected = runs / RARE_LINES.length;
    for (const n of counts.values()) {
      expect(n).toBeGreaterThan(expected * 0.85);
      expect(n).toBeLessThan(expected * 1.15);
    }
    for (const event of TIMER_EVENTS) {
      expect(pickSquadLine(event, "movie", {}, () => 0, context).rare, event).toBe(true);
    }
  });

  it("has Movie Night's own lines for joins and badges", () => {
    for (const event of ["memberJoined", "badgeUnlocked"] as const) {
      for (let i = 0; i < 20; i++) {
        const line = pickSquadLine(event, "movie", {}, () => i / 20, context);
        expect(line.id.startsWith(`${event}.movie.`), line.id).toBe(true);
        expect(MOVIE_LINES[event].map((t) => t.replace("{badge}", "a badge"))).toContain(line.text);
      }
    }
  });

  it("fills in the badge", () => {
    const line = pickSquadLine("badgeUnlocked", "gamer", {}, () => 0, {
      ...context,
      badge: "Night Owl",
    });
    expect(line.text).toBe("Achievement unlocked: Night Owl. 🏅");
  });

  it("fills in the round", () => {
    const line = pickSquadLine("studyResumed", "hype", {}, () => 0, context);
    expect(line.text).toBe("Round 2. Let's get it. 🔥");
  });

  it("never repeats the line it said last for that event", () => {
    const first = pickSquadLine("breakStarted", "drill", {}, () => 0, context);
    const next = pickSquadLine(
      "breakStarted",
      "drill",
      { breakStarted: first.id },
      () => 0,
      context,
    );
    expect(next.id).not.toBe(first.id);
  });

  it("only claims two hours together when it's true", () => {
    const twoHours = RARE_LINES.findIndex((l) => l.minTogetherMinutes === 120);
    const ids = (minutes: number) =>
      new Set(
        Array.from(
          { length: 100 },
          (_, i) =>
            pickSquadLine("breakStarted", "movie", {}, () => i / 100, {
              round: 1,
              togetherMinutes: minutes,
            }).id,
        ),
      );
    expect(ids(119).has(`rare.${twoHours}`)).toBe(false);
    expect(ids(150).has(`rare.${twoHours}`)).toBe(true);
    const line = pickSquadLine("breakStarted", "movie", {}, () => 0, {
      round: 1,
      togetherMinutes: 150,
    });
    expect(line.text).toBe(RARE_LINES[twoHours]!.text.replace("{hours}", "2"));
  });

  it("doesn't repeat the last movie line either", () => {
    const first = pickSquadLine("breakStarted", "movie", {}, () => 0, context);
    const next = pickSquadLine("studyResumed", "movie", { rare: first.id }, () => 0, context);
    expect(next.rare).toBe(true);
    expect(next.id).not.toBe(first.id);
  });
});

describe("squadHeading", () => {
  it("labels timer posts as focus or break, and leaves joins and badges alone", () => {
    expect(squadHeading("sessionStarted", 1, 4)).toBe("📚 Focus · Round 1 of 4");
    expect(squadHeading("studyResumed", 3, 4)).toBe("📚 Focus · Round 3 of 4");
    expect(squadHeading("studyResumed", 3)).toBe("📚 Focus · Round 3");
    expect(squadHeading("breakStarted", 2, 4)).toBe("☕ Break");
    expect(squadHeading("sessionCompleted", 4, 4)).toBe("🛋️ Long break");
    expect(squadHeading("memberJoined", 1, 4)).toBeUndefined();
    expect(squadHeading("badgeUnlocked", 0, 4)).toBeUndefined();
  });
});
