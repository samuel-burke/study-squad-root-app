import { describe, expect, it } from "vitest";
import {
  ALL_PERSONALITIES,
  pickSquadLine,
  RARE_CHANCE,
  RARE_LINES,
  SQUAD_LINES,
  type SquadEvent,
} from "../src";
import { seededRandom } from "./helpers";

const EVENTS = Object.keys(SQUAD_LINES) as SquadEvent[];
const context = { round: 2, togetherMinutes: 30 };
/** A random that skips the rare roll (first call) and then returns `pick`. */
const notRare = (pick: number) => {
  let first = true;
  return () => {
    if (first) {
      first = false;
      return 0.99;
    }
    return pick;
  };
};

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

describe("pickSquadLine", () => {
  it("picks from the event's pool and the enabled personalities", () => {
    for (const event of EVENTS) {
      for (let i = 0; i < 20; i++) {
        const line = pickSquadLine(event, ["chill"], {}, notRare(i / 20), context);
        expect(line.id.startsWith(`${event}.chill.`), line.id).toBe(true);
        expect(line.rare).toBe(false);
      }
    }
  });

  it("uses every personality when none are enabled", () => {
    const seen = new Set<string>();
    const random = seededRandom(3);
    for (let i = 0; i < 400; i++) {
      const line = pickSquadLine("breakStarted", [], {}, random, context);
      if (!line.rare) seen.add(line.id.split(".")[1]!);
    }
    expect([...seen].sort()).toEqual([...ALL_PERSONALITIES].sort());
  });

  it("fills in the badge", () => {
    const line = pickSquadLine("badgeUnlocked", ["gamer"], {}, () => 0, {
      ...context,
      badge: "Night Owl",
    });
    expect(line.text).toBe("Achievement unlocked: Night Owl. 🏅");
  });

  it("fills in the round", () => {
    const line = pickSquadLine("studyResumed", ["hype"], {}, notRare(0), context);
    expect(line.text).toBe("Round 2. Let's get it. 🔥");
  });

  it("never repeats the line it said last for that event", () => {
    const first = pickSquadLine("breakStarted", ["drill"], {}, notRare(0), context);
    const next = pickSquadLine(
      "breakStarted",
      ["drill"],
      { breakStarted: first.id },
      notRare(0),
      context,
    );
    expect(next.id).not.toBe(first.id);
  });

  it("shows a rare line about once in 25 timer posts, and never for joins", () => {
    const random = seededRandom(11);
    let rare = 0;
    const runs = 20_000;
    for (let i = 0; i < runs; i++) {
      if (pickSquadLine("breakStarted", ALL_PERSONALITIES, {}, random, context).rare) rare++;
    }
    expect(rare / runs).toBeGreaterThan(RARE_CHANCE * 0.8);
    expect(rare / runs).toBeLessThan(RARE_CHANCE * 1.2);
    expect(pickSquadLine("memberJoined", ALL_PERSONALITIES, {}, () => 0, context).rare).toBe(false);
  });

  it("only claims two hours together when it's true", () => {
    const twoHours = RARE_LINES.findIndex((l) => l.minTogetherMinutes === 120);
    const ids = (minutes: number) =>
      new Set(
        Array.from({ length: 50 }, (_, i) => {
          let calls = 0;
          const random = () => (calls++ === 0 ? 0 : i / 50);
          return pickSquadLine("breakStarted", ALL_PERSONALITIES, {}, random, {
            round: 1,
            togetherMinutes: minutes,
          });
        }).map((l) => l.id),
      );
    expect(ids(119).has(`rare.${twoHours}`)).toBe(false);
    expect(ids(150).has(`rare.${twoHours}`)).toBe(true);
    const line = pickSquadLine("breakStarted", ALL_PERSONALITIES, {}, () => 0, {
      round: 1,
      togetherMinutes: 150,
    });
    expect(line.text).toBe(RARE_LINES[twoHours]!.text.replace("{hours}", "2"));
  });

  it("doesn't repeat the last rare line either", () => {
    const random = () => 0;
    const first = pickSquadLine("breakStarted", ALL_PERSONALITIES, {}, random, context);
    const next = pickSquadLine(
      "studyResumed",
      ALL_PERSONALITIES,
      { rare: first.id },
      random,
      context,
    );
    expect(next.rare).toBe(true);
    expect(next.id).not.toBe(first.id);
  });
});
