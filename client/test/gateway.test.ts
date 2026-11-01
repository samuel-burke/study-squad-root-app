import { describe, expect, it, vi } from "vitest";
import { DemoGateway, demoOptionsFromSearch } from "../src/api/demoGateway";
import { GatewayError, toGatewayError } from "../src/api/gateway";

describe("toGatewayError", () => {
  it("keeps app errors with a code and message", () => {
    const error = toGatewayError({ code: 1001, message: "Goal can't be empty." });
    expect(error).toBeInstanceOf(GatewayError);
    expect(error).toMatchObject({ code: 1001, message: "Goal can't be empty." });
  });

  it("replaces SDK and network errors with a friendly message", () => {
    expect(toGatewayError(new TypeError("Failed to fetch")).message).toMatch(
      /Couldn't reach Study Squad/,
    );
    expect(toGatewayError({ code: -2, message: "RequestTimeout" }).code).toBe(0);
    expect(toGatewayError(undefined).code).toBe(0);
  });
});

describe("demoOptionsFromSearch", () => {
  it("opens mid-round with bots by default", () => {
    expect(demoOptionsFromSearch("")).toEqual({
      focusMinutes: undefined,
      breakMinutes: undefined,
      elapsedMinutes: 10.5,
      bots: true,
    });
  });

  it("reads fast presets for tests and ignores junk", () => {
    expect(demoOptionsFromSearch("?focus=0.2&break=0.1&bots=0")).toEqual({
      focusMinutes: 0.2,
      breakMinutes: 0.1,
      elapsedMinutes: 0,
      bots: false,
    });
    expect(demoOptionsFromSearch("?focus=-1&elapsed=abc").focusMinutes).toBeUndefined();
  });

  it("reads the test knobs", () => {
    expect(
      demoOptionsFromSearch(
        "?bossLeft=2&bossName=The%20Final%20Final%20Exam&bossHp=100&cap=1000&streak=6&xp=0&missed=1&unlock=giant-slayer,nope&weekHours=6",
      ),
    ).toMatchObject({
      bossHpLeft: 2,
      bossName: "The Final Final Exam",
      bossBaseHp: 100,
      dailyCap: 1000,
      streak: 6,
      xp: 0,
      missedDays: 1,
      unlock: ["giant-slayer"],
      weekHours: 6,
    });
  });

  it("leaves test knobs out when they're missing or junk", () => {
    const options = demoOptionsFromSearch("?bossLeft=0&bossHp=0&streak=-2&xp=&unlock=nope");
    expect(options).not.toHaveProperty("bossHpLeft");
    expect(options).not.toHaveProperty("bossBaseHp");
    expect(options).not.toHaveProperty("streak");
    expect(options).not.toHaveProperty("xp");
    expect(options).not.toHaveProperty("unlock");
  });

  it("previews one badge per tier for unlock=all", () => {
    expect(demoOptionsFromSearch("?unlock=all").unlock).toHaveLength(5);
  });
});

describe("DemoGateway test knobs", () => {
  it("sets up the boss, streak and XP from the options", async () => {
    const gateway = await DemoGateway.create({
      bots: false,
      elapsedMinutes: 0,
      bossHpLeft: 2,
      bossName: "The Final Final Exam",
      bossBaseHp: 100,
      streak: 6,
      xp: 2440,
    });
    const { room, me } = await gateway.getSnapshot();
    expect(room.boss).toMatchObject({ name: "The Final Final Exam", maxHpXp: 200, damageXp: 198 });
    expect(me).toMatchObject({ streak: 6, xpTotal: 2440 });
  });

  it("keeps a missed day alive with the freeze", async () => {
    const gateway = await DemoGateway.create({
      bots: false,
      elapsedMinutes: 0,
      streak: 4,
      missedDays: 1,
    });
    const { me } = await gateway.getSnapshot();
    expect(me.streak).toBe(4);
  });

  it("starts a fresh boss without bots unless asked", async () => {
    const gateway = await DemoGateway.create({ bots: false, elapsedMinutes: 0 });
    const { room } = await gateway.getSnapshot();
    expect(room.boss.damageXp).toBe(0);
  });

  it("plays the unlock preview once, on the first click", async () => {
    vi.useFakeTimers();
    try {
      const gateway = await DemoGateway.create({
        bots: false,
        elapsedMinutes: 0,
        unlock: ["giant-slayer"],
      });
      const badgesEarned = vi.fn();
      const handlers = { badgesEarned } as unknown as Parameters<typeof gateway.subscribe>[0];
      gateway.subscribe(handlers)();
      gateway.subscribe(handlers);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(badgesEarned).not.toHaveBeenCalled();
      window.dispatchEvent(new Event("pointerdown"));
      window.dispatchEvent(new Event("pointerdown"));
      await vi.advanceTimersByTimeAsync(1_000);
      expect(badgesEarned).toHaveBeenCalledTimes(1);
      expect(badgesEarned).toHaveBeenCalledWith(["giant-slayer"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
