import { DomainError, type DevAction, type MyStatusDto, type SnapshotDto } from "@studyroom/core";
import { describe, expect, it, vi } from "vitest";
import { DevCommands, isDevCommand, type DevCommandDeps } from "../src/devCommands";

const quiet = { debug() {}, info() {}, warn() {}, error() {} };

function setup(overrides: Partial<DevCommandDeps> = {}) {
  const replies: string[] = [];
  const actions: DevAction[] = [];
  const me = { userId: "dev", level: 4, streak: 2, keepGoingEndsAt: 0 } as unknown as MyStatusDto;
  const snapshot = {
    me,
    room: { serverNow: 1_000, timer: { round: 2 } },
  } as unknown as SnapshotDto;
  const notifier = {
    personalResult: vi.fn(),
    myStatusUpdated: vi.fn(),
    badgesEarned: vi.fn(),
    highFive: vi.fn(),
  };
  const deps: DevCommandDeps = {
    allowed: (userId) => userId === "dev",
    testMode: () => true,
    reply: async (_channelId, text) => void replies.push(text),
    smoke: vi.fn(async () => {}),
    admin: async (action) => (actions.push(action), "done."),
    startTestRound: vi.fn(async () => snapshot),
    snapshot: async () => snapshot,
    advanceClock: vi.fn(async (ms: number) => ms),
    clockOffset: () => 0,
    reset: vi.fn(async () => "Wiped."),
    notifier,
    celebrate: vi.fn(),
    logger: quiet,
    ...overrides,
  };
  const commands = new DevCommands(deps);
  const say = (content: string, userId = "dev") =>
    commands.handle({ userId, channelId: "c1", content });
  return { say, replies, actions, notifier, deps };
}

describe("developer chat commands", () => {
  it("ignores everyone not on the list, and ordinary messages", async () => {
    const { say, replies, actions } = setup();
    await say("!xp me 500", "ana");
    await say("hello !xp me 500");
    expect(replies).toEqual([]);
    expect(actions).toEqual([]);
    expect(isDevCommand("!help")).toBe(true);
    expect(isDevCommand("! help")).toBe(false);
  });

  it("lists the commands", async () => {
    const { say, replies } = setup();
    await say("!help");
    expect(replies[0]).toMatch(/Developer commands/);
  });

  it("sets values for me or an @mention", async () => {
    const { say, actions, replies } = setup();
    await say("!xp me 500");
    await say("!level [@Ana Smith](root://user/u-ana) 12");
    await say("!streak me 30");
    await say("!badge me night-owl");
    await say("!end [@Ana](root://user/u-ana)");
    expect(actions).toEqual([
      { kind: "setXp", userId: "dev", value: 500 },
      { kind: "setLevel", userId: "u-ana", value: 12 },
      { kind: "setStreak", userId: "dev", value: 30 },
      { kind: "grantBadge", userId: "dev", badgeId: "night-owl" },
      { kind: "endTimer", userId: "u-ana" },
    ]);
    expect(replies.every((r) => r === "🧪 done.")).toBe(true);
  });

  it("asks who, and for a whole number", async () => {
    const { say, replies, actions } = setup();
    await say("!xp 500");
    await say("!xp me lots");
    expect(actions).toEqual([]);
    expect(replies).toEqual(["🧪 Say who: `me` or an @mention.", "🧪 That needs a whole number."]);
  });

  it("drives the boss, the room, the recap and the bot", async () => {
    const { say, actions } = setup();
    for (const c of ["!boss hp 50", "!boss defeat", "!boss new", "!room skip", "!room stop"])
      await say(c);
    await say("!recap");
    await say("!botline");
    expect(actions.map((a) => a.kind)).toEqual([
      "bossHp",
      "bossDefeat",
      "bossNew",
      "roomSkip",
      "roomStop",
      "recap",
      "botLine",
    ]);
  });

  it("passes on the engine's refusal when test mode is off", async () => {
    const { say, replies } = setup({
      admin: async () => {
        throw new DomainError(1005, "Developer test mode is off here.");
      },
      testMode: () => false,
    });
    await say("!xp me 5");
    await say("!test round");
    await say("!clock +1h");
    expect(replies[0]).toBe("🧪 Developer test mode is off here.");
    expect(replies[1]).toMatch(/Developer test mode is off here/);
    expect(replies[2]).toMatch(/Developer test mode is off here/);
  });

  it("jumps the clock forward only", async () => {
    const { say, replies, deps } = setup();
    await say("!clock +1d");
    expect(deps.advanceClock).toHaveBeenCalledWith(86_400_000);
    expect(replies[0]).toMatch(/Jumped 1 day/);
    await say("!clock -1d");
    await say("!clock +5w");
    expect(replies[1]).toMatch(/only goes forward/);
    expect(replies[2]).toMatch(/between 1 minute and 4 weeks/);
  });

  it("wipes the community only with confirm and test mode", async () => {
    const { say, replies, deps } = setup();
    await say("!reset");
    expect(deps.reset).not.toHaveBeenCalled();
    expect(replies[0]).toMatch(/!reset confirm/);
    await say("!reset confirm");
    expect(deps.reset).toHaveBeenCalledTimes(1);
    expect(replies[1]).toBe("🧪 Wiped.");
    const off = setup({ testMode: () => false });
    await off.say("!reset confirm");
    expect(off.deps.reset).not.toHaveBeenCalled();
    expect(off.replies[0]).toMatch(/test mode is off/);
  });

  it("starts the test round and runs the smoke test", async () => {
    const { say, replies, deps } = setup();
    await say("!test round");
    expect(deps.startTestRound).toHaveBeenCalledWith("dev");
    expect(replies[0]).toMatch(/1-minute test round/);
    await say("!smoke");
    expect(deps.smoke).toHaveBeenCalledWith("dev", "c1");
    expect(replies).toHaveLength(1); // the smoke test posts its own summary
  });

  it("plays previews on the developer's own screen only, even without test mode", async () => {
    const { say, notifier, deps } = setup({ testMode: () => false });
    await say("!preview badge night-owl");
    await say("!preview levelup");
    await say("!preview break");
    await say("!preview highfive");
    await say("!preview keepgoing");
    await say("!preview celebrate");
    expect(notifier.badgesEarned).toHaveBeenCalledWith("dev", ["night-owl"]);
    expect(notifier.myStatusUpdated).toHaveBeenCalledWith(
      "dev",
      expect.objectContaining({ level: 5 }),
    );
    expect(notifier.myStatusUpdated).toHaveBeenCalledWith(
      "dev",
      expect.objectContaining({ keepGoingEndsAt: 31_000 }),
    );
    expect(notifier.personalResult).toHaveBeenCalledWith(
      "dev",
      expect.objectContaining({ finished: true }),
    );
    expect(notifier.highFive).toHaveBeenCalledWith("dev", { fromUserId: "dev", emoji: "🔥" });
    expect(deps.celebrate).toHaveBeenCalledWith(
      "dev",
      expect.objectContaining({ kind: "focus", round: 2 }),
    );
  });

  it("says when a command is unknown or a reply fails", async () => {
    const warn = vi.fn();
    const { say, replies } = setup({ logger: { ...quiet, warn } });
    await say("!dance");
    expect(replies[0]).toMatch(/!help/);
    const failing = setup({
      reply: async () => {
        throw new Error("no permission");
      },
      logger: { ...quiet, warn },
    });
    await failing.say("!help");
    expect(warn).toHaveBeenCalledWith("dev command reply failed", expect.anything());
  });
});
