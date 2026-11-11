import { beforeEach, describe, expect, it } from "vitest";
import { StudyRoomEngine } from "@studyroom/core";
import type { Knex } from "knex";
import { DevClock, DEV_CLOCK_KEY } from "../src/adapters/devClock";
import { VOICE_PICK_KEY } from "../src/adapters/voiceChannelPicker";
import { KnexStore } from "../src/persistence/knexStore";
import {
  configWith,
  FakeClock,
  ManualScheduler,
  RecordingAnnouncer,
  RecordingNotifier,
  silentLogger,
} from "../../core/test/helpers";
import { freshDatabase } from "./sqlite";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * New York wall-clock time as UTC. Daylight saving ends at 2am on Sunday
 * November 1, 2026, so the run crosses it.
 */
function ny(month: 10 | 11, day: number, hour: number, minute = 0): number {
  const offsetHours = month === 10 || (month === 11 && day === 1 && hour < 2) ? 4 : 5;
  return Date.UTC(2026, month - 1, day, hour + offsetHours, minute);
}

/**
 * Plays out weeks of real use on the same SQLite tables and migrations Root
 * runs, with the clock moved forward the way the developer's `!clock` does:
 * streaks, freezes, the 4am day change, the Monday reset, a server restart
 * in the middle, and `!reset` at the end.
 */
describe("time travel on the real database", () => {
  let db: Knex;
  let clock: FakeClock;
  let scheduler: ManualScheduler;
  let engine: StudyRoomEngine;
  const config = configWith({ devTestMode: true });

  /** A fresh engine on the same database, like a server restart. */
  function boot() {
    scheduler = new ManualScheduler();
    let id = 1;
    engine = new StudyRoomEngine({
      store: new KnexStore(db),
      clock,
      scheduler,
      notifier: new RecordingNotifier(),
      announcer: new RecordingAnnouncer(),
      logger: silentLogger,
      config,
      newId: () => `id-${id++}`,
      random: () => 0.5,
    });
  }

  async function jumpTo(at: number) {
    while (scheduler.at !== null && scheduler.at <= at) {
      clock.current = Math.max(clock.current, scheduler.at);
      scheduler.fireIfDue(clock.current);
      await engine.idle();
    }
    clock.current = at;
    await engine.tick();
    await engine.idle();
  }

  /** A full 25 minute solo, started at `at`, then its break. */
  async function study(at: number) {
    await jumpTo(at);
    await engine.startSolo("ana", 25);
    await jumpTo(at + 35 * MINUTE);
  }

  const me = async () => (await engine.getSnapshot("ana")).me;
  const badgeIds = async () => (await engine.getProgress("ana")).badges.map((b) => b.id);

  beforeEach(async () => {
    db = await freshDatabase();
    clock = new FakeClock(ny(10, 28, 9));
    boot();
  });

  it("keeps streaks, freezes and the weekly boss right across two weeks", async () => {
    await study(ny(10, 28, 10)); // Wednesday
    expect(await me()).toMatchObject({ streak: 1, freezeAvailable: true });
    const firstBoss = (await engine.getSnapshot("ana")).room.boss;
    expect(firstBoss.damageXp).toBeGreaterThan(0);

    // 3am Thursday still counts as Wednesday: the day changes at 4am.
    await study(ny(10, 29, 3));
    expect((await me()).streak).toBe(1);
    await study(ny(10, 29, 10));
    expect((await me()).streak).toBe(2);

    // Skip Friday. Saturday's session spends this week's freeze.
    await jumpTo(ny(10, 31, 9));
    expect(await me()).toMatchObject({ streak: 2, freezeAvailable: false });
    expect(await badgeIds()).not.toContain("freeze-saved");
    await study(ny(10, 31, 10));
    expect(await me()).toMatchObject({ streak: 3, freezeAvailable: false });
    expect(await badgeIds()).toContain("freeze-saved");

    // The server restarts. Everything comes back from the database.
    boot();
    expect(await me()).toMatchObject({ streak: 3, freezeAvailable: false });

    // Sunday, across the end of daylight saving.
    await study(ny(11, 1, 10));
    expect((await me()).streak).toBe(4);

    // Monday: a fresh freeze and a fresh boss.
    await jumpTo(ny(11, 2, 9));
    expect((await me()).freezeAvailable).toBe(true);
    const mondayBoss = (await engine.getSnapshot("ana")).room.boss;
    expect(mondayBoss.endsAt).toBeGreaterThan(firstBoss.endsAt);
    expect(mondayBoss.damageXp).toBe(0);
    await study(ny(11, 2, 10));
    expect((await me()).streak).toBe(5);

    // Two missed days in one week can't be covered.
    await jumpTo(ny(11, 5, 9));
    expect((await me()).streak).toBe(0);
    await study(ny(11, 5, 10));
    expect((await me()).streak).toBe(1);
  });

  it("starts the community over on !reset and puts the clock back", async () => {
    const devClock = new DevClock(new KnexStore(db).kv, () => clock.current);
    await new KnexStore(db).kv.set(VOICE_PICK_KEY, "voice-1");
    await devClock.advance(2 * 24 * HOUR);
    await study(ny(10, 28, 10));
    await engine.devAdmin({ kind: "setXp", userId: "ana", value: 5_000 });
    expect((await me()).xpTotal).toBe(5_000);

    await engine.devAdmin({ kind: "reset", keepKv: [VOICE_PICK_KEY] });
    await devClock.reset();

    expect(await me()).toMatchObject({ xpTotal: 0, streak: 0, status: "idle" });
    expect(devClock.offset()).toBe(0);
    const kv = new KnexStore(db).kv;
    expect(await kv.get(VOICE_PICK_KEY)).toBe("voice-1");
    expect(await kv.get(DEV_CLOCK_KEY)).toBe(0);
    const left = await db("session_log").count({ n: "*" }).first();
    expect(Number(left?.n)).toBe(0);
  });

  it("won't reset while Developer test mode is off", async () => {
    await engine.setConfig(configWith());
    await study(ny(10, 28, 10));
    await expect(engine.devAdmin({ kind: "reset", keepKv: [] })).rejects.toThrow(/test mode/);
    expect((await me()).streak).toBe(1);
  });
});
