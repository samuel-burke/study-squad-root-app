import { describe, expect, it } from "vitest";
import { ErrorCode, levelFromXp, type DevAction } from "../src";
import { configWith, createHarness, MINUTE } from "./helpers";

const TEST_MODE = configWith({ devTestMode: true });

describe("developer test mode", () => {
  it("refuses every change while the setting is off", async () => {
    const { engine } = createHarness();
    await expect(
      engine.devAdmin({ kind: "setXp", userId: "ana", value: 500 }),
    ).rejects.toMatchObject({ code: ErrorCode.Forbidden });
  });

  it("sets XP, level and streak", async () => {
    const { engine } = createHarness(TEST_MODE);
    await engine.devAdmin({ kind: "setXp", userId: "ana", value: 500 });
    expect((await engine.getSnapshot("ana")).me.xpTotal).toBe(500);
    await engine.devAdmin({ kind: "setLevel", userId: "ana", value: 12 });
    expect(levelFromXp((await engine.getSnapshot("ana")).me.xpTotal).level).toBe(12);
    await engine.devAdmin({ kind: "setStreak", userId: "ana", value: 30 });
    expect((await engine.getSnapshot("ana")).me.streak).toBe(30);
    await expect(
      engine.devAdmin({ kind: "setLevel", userId: "ana", value: 0 }),
    ).rejects.toMatchObject({ code: ErrorCode.Validation });
  });

  it("gives a badge once and pushes its unlock", async () => {
    const { engine, notifier } = createHarness(TEST_MODE);
    expect(
      await engine.devAdmin({ kind: "grantBadge", userId: "ana", badgeId: "night-owl" }),
    ).toMatch(/^Gave /);
    expect(notifier.badges).toContainEqual({ userId: "ana", badgeIds: ["night-owl"] });
    expect(
      await engine.devAdmin({ kind: "grantBadge", userId: "ana", badgeId: "night-owl" }),
    ).toMatch(/already/);
    await expect(
      engine.devAdmin({ kind: "grantBadge", userId: "ana", badgeId: "nope" }),
    ).rejects.toMatchObject({ code: ErrorCode.NotFound });
  });

  it("sets the boss's HP, defeats it and rolls a fresh one", async () => {
    const { engine } = createHarness(TEST_MODE);
    await engine.devAdmin({ kind: "bossHp", value: 50 });
    const hit = (await engine.getSnapshot("ana")).room.boss;
    expect(hit.maxHpXp - hit.damageXp).toBe(50);
    expect(hit.defeated).toBe(false);
    await engine.devAdmin({ kind: "bossDefeat", byUserId: "ana" });
    expect((await engine.getSnapshot("ana")).room.boss.defeated).toBe(true);
    await engine.devAdmin({ kind: "bossNew" });
    const boss = (await engine.getSnapshot("ana")).room.boss;
    expect(boss.defeated).toBe(false);
    expect(boss.damageXp).toBe(0);
  });

  it("skips the room's phase and stops the room timer", async () => {
    const { engine } = createHarness(TEST_MODE);
    await engine.joinRoomTimer("ana");
    expect(await engine.devAdmin({ kind: "roomSkip" })).toMatch(/focus/);
    expect((await engine.getSnapshot("ana")).room.timer.phase).toBe("break");
    await engine.devAdmin({ kind: "roomStop" });
    const snap = await engine.getSnapshot("ana");
    expect(snap.me.status).toBe("idle");
    expect(snap.room.members).toHaveLength(0);
  });

  it("ends a member's timer and posts the recap and a bot line", async () => {
    const { engine, announcer, advance } = createHarness(TEST_MODE);
    await engine.startSolo("ana", 25);
    await advance(10 * MINUTE);
    await engine.devAdmin({ kind: "endTimer", userId: "ana" });
    expect((await engine.getSnapshot("ana")).me.status).toBe("idle");
    const actions: DevAction[] = [{ kind: "recap" }, { kind: "botLine", byUserId: "ana" }];
    for (const action of actions) await engine.devAdmin(action);
    await engine.idle();
    expect(announcer.posts.map((p) => p.kind)).toEqual(expect.arrayContaining(["recap", "squad"]));
  });
});
