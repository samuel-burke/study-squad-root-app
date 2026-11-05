import { describe, expect, it } from "vitest";
import {
  ALL_PERSONALITIES,
  MOVIE_LINES,
  pickSquadLine,
  RARE_LINES,
  SQUAD_LINES,
  squadHeading,
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
      ...Object.values(MOVIE_LINES).flat(),
    ];
    for (const line of all) {
      expect(line.length, line).toBeLessThanOrEqual(90);
      expect(line, line).not.toMatch(/[@[\]]/);
    }
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("pickSquadLine", () => {
  const TIMER_EVENTS = EVENTS.filter((e) => e !== "memberJoined" && e !== "badgeUnlocked");

  it("picks from every personality and the movie lines", () => {
    const seen = new Set<string>();
    const random = seededRandom(3);
    for (let i = 0; i < 600; i++) {
      const line = pickSquadLine("breakStarted", {}, random, context);
      if (!line.rare && !line.id.includes(".movie.")) seen.add(line.id.split(".")[1]!);
    }
    expect([...seen].sort()).toEqual([...ALL_PERSONALITIES].sort());
  });

  it("gives every line the same chance, movie lines included", () => {
    const random = seededRandom(11);
    const counts = new Map<string, number>();
    const context150 = { round: 1, togetherMinutes: 150 };
    const size =
      ALL_PERSONALITIES.reduce((sum, p) => sum + SQUAD_LINES.breakStarted[p].length, 0) +
      (MOVIE_LINES.breakStarted?.length ?? 0) +
      RARE_LINES.length;
    const runs = size * 300;
    for (let i = 0; i < runs; i++) {
      const line = pickSquadLine("breakStarted", {}, random, context150);
      counts.set(line.id, (counts.get(line.id) ?? 0) + 1);
    }
    expect(counts.size).toBe(size);
    for (const n of counts.values()) {
      expect(n).toBeGreaterThan(300 * 0.7);
      expect(n).toBeLessThan(300 * 1.3);
    }
  });

  it("uses the movie join and badge lines for joins and badges, not the timer ones", () => {
    for (const event of ["memberJoined", "badgeUnlocked"] as const) {
      const ids = new Set(
        Array.from(
          { length: 1000 },
          (_, i) => pickSquadLine(event, {}, () => i / 1000, context).id,
        ),
      );
      expect([...ids].filter((id) => id.startsWith("rare."))).toEqual([]);
      for (let i = 0; i < MOVIE_LINES[event]!.length; i++)
        expect(ids.has(`${event}.movie.${i}`)).toBe(true);
    }
    for (const event of TIMER_EVENTS) {
      const ids = Array.from(
        { length: 1000 },
        (_, i) => pickSquadLine(event, {}, () => i / 1000, context).id,
      );
      expect(ids.some((id) => id.startsWith("rare."))).toBe(true);
    }
  });

  it("fills in the badge", () => {
    const texts = Array.from(
      { length: 400 },
      (_, i) =>
        pickSquadLine("badgeUnlocked", {}, () => i / 400, { ...context, badge: "Night Owl" }).text,
    );
    expect(texts).toContain("Achievement unlocked: Night Owl. 🏅");
    for (const text of texts) expect(text).not.toContain("{badge}");
  });

  it("fills in the round", () => {
    const texts = Array.from(
      { length: 400 },
      (_, i) => pickSquadLine("studyResumed", {}, () => i / 400, context).text,
    );
    expect(texts).toContain("Round 2. Let's get it. 🔥");
    for (const text of texts) expect(text).not.toContain("{round}");
  });

  it("never repeats the line it said last for that event", () => {
    const first = pickSquadLine("breakStarted", {}, () => 0, context);
    const next = pickSquadLine("breakStarted", { breakStarted: first.id }, () => 0, context);
    expect(next.id).not.toBe(first.id);
  });

  it("only claims two hours together when it's true", () => {
    const twoHours = RARE_LINES.findIndex((l) => l.minTogetherMinutes === 120);
    const ids = (minutes: number) =>
      new Set(
        Array.from(
          { length: 1000 },
          (_, i) =>
            pickSquadLine("breakStarted", {}, () => i / 1000, {
              round: 1,
              togetherMinutes: minutes,
            }).id,
        ),
      );
    expect(ids(119).has(`rare.${twoHours}`)).toBe(false);
    expect(ids(150).has(`rare.${twoHours}`)).toBe(true);
  });

  it("doesn't repeat the last movie line either", () => {
    const random = () => 0.99;
    const first = pickSquadLine("breakStarted", {}, random, context);
    expect(first.rare).toBe(true);
    const next = pickSquadLine("studyResumed", { rare: first.id }, random, context);
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
