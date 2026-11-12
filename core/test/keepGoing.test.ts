import { describe, expect, it } from "vitest";
import { buildCycle, customPreset, DEFAULT_PRESET, keepGoingWindow } from "../src";
import { configWith, createHarness, MINUTE, T0 } from "./helpers";

/** Default 25/5 preset: the last round ends at T0 + 115 min, the long break at T0 + 130 min. */
const LONG_BREAK = T0 + 115 * MINUTE;
const CYCLE_END = T0 + 130 * MINUTE;

describe("keepGoingWindow", () => {
  it("is the cycle's final long break", () => {
    expect(keepGoingWindow(buildCycle(T0, DEFAULT_PRESET))).toEqual({
      opensAt: LONG_BREAK,
      closesAt: CYCLE_END,
    });
  });
});

describe('"Keep going?" at the end of a cycle', () => {
  it("never asks during focus, then asks everyone who focused when the long break starts", async () => {
    const { engine, notifier, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await engine.joinRoomTimer("ben");
    await advance(LONG_BREAK - T0 - 1);
    expect(notifier.statuses.some((s) => s.me.keepGoingEndsAt > 0)).toBe(false);

    notifier.statuses = [];
    await advance(1);
    expect(
      notifier.statuses.filter((s) => s.me.keepGoingEndsAt === CYCLE_END).map((s) => s.userId),
    ).toEqual(expect.arrayContaining(["ana", "ben"]));
    expect((await engine.getSnapshot("ana")).me.keepGoingEndsAt).toBe(CYCLE_END);
  });

  it("rolls whoever taps into the next cycle, and releases the rest with everything they earned", async () => {
    const { engine, notifier, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await engine.joinRoomTimer("ben");
    await advance(LONG_BREAK - T0 + 5 * MINUTE);
    const me = await engine.keepGoing("ana");
    expect(me.keepGoingEndsAt).toBe(0);
    expect(me.onRoomTimer).toBe(true);
    await advance(CYCLE_END - (LONG_BREAK + 5 * MINUTE));

    const ana = await engine.getSnapshot("ana");
    expect(ana.room.timer).toMatchObject({ phase: "focus", round: 1, phaseStartedAt: CYCLE_END });
    expect(ana.room.members.map((m) => m.userId)).toEqual(["ana"]);
    expect(ana.me).toMatchObject({ onRoomTimer: true, keepGoingEndsAt: 0 });

    // Ben didn't tap: he's off the timer, but all four rounds still counted for him.
    const ben = await engine.getSnapshot("ben");
    expect(ben.me.onRoomTimer).toBe(false);
    const benRounds = notifier.personal.filter((p) => p.userId === "ben").map((p) => p.event);
    expect(benRounds.map((r) => [r.round, r.finished])).toEqual([
      [1, true],
      [2, true],
      [3, true],
      [4, true],
    ]);
    expect(ben.me.xpToday).toBe(240); // 4 rounds x 50 XP x 1.2 combo
    expect(ben.me.streak).toBe(1);
  });

  it("asks again at the end of every cycle", async () => {
    const { engine, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await advance(LONG_BREAK - T0);
    await engine.keepGoing("ana");
    await advance(CYCLE_END - LONG_BREAK + 115 * MINUTE);
    expect((await engine.getSnapshot("ana")).me.keepGoingEndsAt).toBe(CYCLE_END + 130 * MINUTE);
    await advance(15 * MINUTE);
    expect((await engine.getSnapshot("ana")).me.onRoomTimer).toBe(false);
  });

  it("doesn't ask people who joined during the long break, and carries them over as before", async () => {
    const { engine, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await advance(LONG_BREAK - T0 + 2 * MINUTE);
    const theo = await engine.joinRoomTimer("theo");
    expect(theo.me.keepGoingEndsAt).toBe(0);
    await advance(13 * MINUTE);
    const snap = await engine.getSnapshot("theo");
    expect(snap.room.members.map((m) => m.userId)).toEqual(["theo"]);
  });

  it("ignores a tap outside the long break, or from someone not on the timer", async () => {
    const { engine, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await advance(10 * MINUTE);
    expect((await engine.keepGoing("ana")).keepGoingEndsAt).toBe(0);
    expect((await engine.keepGoing("nobody")).onRoomTimer).toBe(false);
    await advance(CYCLE_END - T0 - 10 * MINUTE);
    expect((await engine.getSnapshot("ana")).me.onRoomTimer).toBe(false);
  });

  it("goes idle when nobody taps, and lets someone who missed it rejoin at once", async () => {
    const { engine, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await advance(CYCLE_END - T0);
    expect((await engine.getSnapshot("ana")).room.timer.phase).toBe("idle");
    const snap = await engine.joinRoomTimer("ana");
    expect(snap.room.timer).toMatchObject({ phase: "focus", round: 1 });
  });

  it("starts the next cycle with the admins' current preset", async () => {
    const { engine, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await advance(LONG_BREAK - T0);
    await engine.keepGoing("ana");
    await engine.setConfig(configWith({ presetKey: "50-10", preset: customPreset(50, 10) }));
    await advance(CYCLE_END - LONG_BREAK);
    const timer = (await engine.getSnapshot("ana")).room.timer;
    expect(timer).toMatchObject({ phase: "focus", phaseEndsAt: CYCLE_END + 50 * MINUTE });
  });
});
