import { describe, expect, it, vi } from "vitest";
import { MemberStatus, Phase } from "@studyroom/gen-shared";
import { RequestFailure, StudyRoomHandlers } from "../src/handlers";
import { createHarness } from "../../core/test/helpers";
import { DomainError, ErrorCode as CoreErrorCode } from "@studyroom/core";

function setup(options: ConstructorParameters<typeof StudyRoomHandlers>[2] = {}) {
  const harness = createHarness();
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const handlers = new StudyRoomHandlers(harness.engine, logger, options);
  return { ...harness, handlers, logger };
}

async function failure(promise: Promise<unknown>): Promise<RequestFailure> {
  const error = await promise.then(
    () => {
      throw new Error("expected failure");
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RequestFailure);
  return error as RequestFailure;
}

describe("StudyRoomHandlers", () => {
  it("passes voice channel picks through and reports refusals safely", async () => {
    const choice = {
      canEdit: true,
      selectedId: "v1",
      channels: [{ id: "v1", name: "Voice" }],
      status: "#Voice",
    };
    const voicePicker = {
      choice: vi.fn(async () => choice),
      pick: vi.fn(async (userId: string) => {
        if (userId !== "admin") throw new DomainError(CoreErrorCode.Forbidden, "Admins only.");
        return choice;
      }),
    };
    const { handlers } = setup({ voicePicker });
    expect(await handlers.getVoiceChannels("ana")).toEqual(choice);
    expect(await handlers.setVoiceChannel("admin", { channelId: "v1" })).toEqual(choice);
    expect(voicePicker.pick).toHaveBeenCalledWith("admin", "v1");
    const error = await failure(handlers.setVoiceChannel("ana", { channelId: "v1" }));
    expect(error).toMatchObject({ code: CoreErrorCode.Forbidden, message: "Admins only." });
  });

  it("says voice settings aren't available without a picker", async () => {
    const { handlers } = setup();
    expect((await failure(handlers.getVoiceChannels("ana"))).code).toBe(CoreErrorCode.NotFound);
  });

  it("runs break fun through the engine and reports refusals safely", async () => {
    const { handlers, advance } = setup();
    await handlers.joinRoomTimer("ana", { goals: [] });
    await handlers.joinRoomTimer("kai", { goals: [] });
    const early = await failure(handlers.sendHighFive("ana", { toUserId: "kai", emoji: "👋" }));
    expect(early.code).toBe(CoreErrorCode.Conflict);
    await advance(26 * 60_000);
    const snap = await handlers.sendHighFive("ana", { toUserId: "kai", emoji: "👋" });
    expect(snap.room?.members.find((m) => m.userId === "kai")?.highFives).toBe(1);
    const done = await handlers.completeBreakChallenge("ana");
    expect(done.room?.members.find((m) => m.userId === "ana")?.challengeDone).toBe(true);
  });

  it("returns Protobuf-shaped snapshots", async () => {
    const { handlers } = setup();
    const snap = await handlers.joinRoomTimer("ana", { goals: ["Read ch. 4"] });
    expect(snap.room?.timer?.phase).toBe(Phase.FOCUS);
    expect(snap.me?.status).toBe(MemberStatus.ROOM_FOCUS);
    expect(snap.me?.goals.map((g) => g.text)).toEqual(["Read ch. 4"]);
  });

  it("acts only as the authenticated caller", async () => {
    const { handlers } = setup();
    const me = await handlers.addGoal("ana", { text: "Mine" });
    const goalId = me.goals[0]!.id;
    const error = await failure(handlers.setGoalDone("mallory", { goalId, done: true }));
    expect(error.code).toBe(CoreErrorCode.NotFound);
    await expect(failure(handlers.getRoom(""))).resolves.toMatchObject({
      code: CoreErrorCode.Validation,
    });
  });

  it("passes engine validation errors through with their message", async () => {
    const { handlers } = setup();
    const error = await failure(handlers.startSolo("ana", { minutes: 1, goals: [] }));
    expect(error.code).toBe(CoreErrorCode.Validation);
    expect(error.message).toMatch(/between 5 and 180/);
  });

  it("refuses a leaderboard metric or period it doesn't know", async () => {
    const { handlers } = setup();
    const error = await failure(handlers.getLeaderboard("ana", { by: 9 as never, period: 0 }));
    expect(error.code).toBe(CoreErrorCode.Validation);
    const period = await failure(handlers.getLeaderboard("ana", { by: 0, period: 9 as never }));
    expect(period.code).toBe(CoreErrorCode.Validation);
  });

  it("rate limits writes per user without affecting others", async () => {
    const now = 0;
    const { handlers, logger } = setup({
      writeLimit: { capacity: 2, perSecond: 0.001 },
      now: () => now,
    });
    await handlers.addGoal("ana", { text: "1" });
    await handlers.addGoal("ana", { text: "2" });
    const error = await failure(handlers.addGoal("ana", { text: "3" }));
    expect(error.code).toBe(CoreErrorCode.RateLimited);
    expect(logger.warn).toHaveBeenCalledWith("rate limited", {
      operation: "addGoal",
      userId: "ana",
    });
    await expect(handlers.addGoal("kai", { text: "1" })).resolves.toBeDefined();
    // Reads have their own budget.
    await expect(handlers.getRoom("ana")).resolves.toBeDefined();
  });

  it("hides unexpected errors behind a generic message and logs the details", async () => {
    const { handlers, engine, logger } = setup();
    vi.spyOn(engine, "getSnapshot").mockRejectedValue(new Error("SQLITE_CORRUPT: /data/app.db"));
    const error = await failure(handlers.getRoom("ana"));
    expect(error.code).toBe(CoreErrorCode.Internal);
    expect(error.message).not.toContain("SQLITE");
    expect(logger.error).toHaveBeenCalledWith(
      "request failed",
      expect.objectContaining({
        operation: "getRoom",
        error: expect.stringContaining("SQLITE_CORRUPT"),
      }),
    );
  });

  it("covers the rest of the API", async () => {
    const { handlers } = setup();
    await handlers.startSolo("priya", {
      minutes: 25,
      goals: ["Practice set B"],
      goalsPrivate: true,
    });
    expect((await handlers.endSolo("priya")).me?.status).toBe(MemberStatus.IDLE);
    await handlers.joinRoomTimer("priya", { goals: [] });
    expect((await handlers.leaveRoomTimer("priya")).me?.onRoomTimer).toBe(false);
    const me = await handlers.setGoalsPrivate("priya", { goalsPrivate: false });
    expect(me.goalsPrivate).toBe(false);
    const goalId = me.goals[0]!.id;
    expect((await handlers.editGoal("priya", { goalId, text: "Set C" })).goals[0]!.text).toBe(
      "Set C",
    );
    const finished = (await handlers.setGoalDone("priya", { goalId, done: true })).goals[0]!;
    expect(finished.done).toBe(true);
    expect(finished.completedAtMs).toBeGreaterThanOrEqual(finished.createdAtMs);
    expect((await handlers.clearDoneGoals("priya")).goals).toEqual([]);
    const added = (await handlers.addGoal("priya", { text: "One more" })).goals[0]!;
    expect((await handlers.deleteGoal("priya", { goalId: added.id })).goals).toEqual([]);
    expect((await handlers.getProgress("priya")).days).toHaveLength(35);
    expect((await handlers.getLeaderboard("priya", { by: 0, period: 0 })).startDay).toBe(
      "2026-10-26",
    );
    const month = await handlers.getLeaderboard("priya", { by: 2, period: 2 });
    expect([month.by, month.period, month.startDay]).toEqual([2, 2, "2026-10-01"]);
    const hidden = await handlers.setLeaderboardHidden("priya", {
      hidden: true,
      by: 2,
      period: 4,
    });
    expect([hidden.hidden, hidden.by, hidden.period, hidden.startDay]).toEqual([true, 2, 4, ""]);
    expect((await handlers.getMemberProfile("ana", { userId: "priya" })).userId).toBe("priya");
  });

  it("says why feedback can't be sent when it isn't set up", async () => {
    const { handlers } = setup();
    const off = await failure(handlers.sendFeedback("priya", { text: "hi" }));
    expect(off.code).toBe(CoreErrorCode.Conflict);
  });

  it("deletes only the caller's data", async () => {
    const { handlers } = setup();
    await handlers.addGoal("ana", { text: "Mine" });
    await handlers.addGoal("kai", { text: "Kai's" });
    const me = await handlers.deleteMyData("ana");
    expect(me.goals).toEqual([]);
    expect((await handlers.getRoom("kai")).me?.goals.map((g) => g.text)).toEqual(["Kai's"]);
  });
});
