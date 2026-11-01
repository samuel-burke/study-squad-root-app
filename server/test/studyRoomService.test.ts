import { describe, expect, it, vi } from "vitest";
import { RootServerException } from "@rootsdk/server-app";
import { RequestFailure, type StudyRoomHandlers as Handlers } from "../src/handlers";
import { StudyRoomService } from "../src/studyRoomService";

// The real Root SDK needs a running Root host. Mock just what the service touches.
vi.mock("@rootsdk/server-app", () => {
  class RootServerException extends Error {
    constructor(
      readonly code: number,
      message: string,
    ) {
      super(message);
    }
  }
  return { RootServerException };
});
vi.mock("@studyroom/gen-server", () => ({ StudyRoomServiceBase: class {} }));

const client = { userId: "ana" } as never;

function bound(overrides: Partial<Record<keyof Handlers, () => Promise<unknown>>> = {}) {
  const ok = (name: string) => vi.fn(async () => ({ from: name }));
  const handlers = {
    getRoom: ok("getRoom"),
    joinRoomTimer: ok("joinRoomTimer"),
    leaveRoomTimer: ok("leaveRoomTimer"),
    startSolo: ok("startSolo"),
    endSolo: ok("endSolo"),
    addGoal: ok("addGoal"),
    setGoalDone: ok("setGoalDone"),
    deleteGoal: ok("deleteGoal"),
    setGoalsPrivate: ok("setGoalsPrivate"),
    getProgress: ok("getProgress"),
    deleteMyData: ok("deleteMyData"),
    setCardStyle: ok("setCardStyle"),
    setBadgeShowcase: ok("setBadgeShowcase"),
    getLeaderboard: ok("getLeaderboard"),
    setLeaderboardHidden: ok("setLeaderboardHidden"),
    keepGoing: ok("keepGoing"),
    ...overrides,
  };
  const service = new StudyRoomService();
  service.bind(handlers as unknown as Handlers);
  return { service, handlers };
}

describe("StudyRoomService", () => {
  it("routes every RPC to its handler as the authenticated caller", async () => {
    const { service, handlers } = bound();
    const calls: [keyof Handlers, () => Promise<unknown>, unknown?][] = [
      ["getRoom", () => service.getRoom({}, client)],
      [
        "joinRoomTimer",
        () => service.joinRoomTimer({ goals: ["a"] } as never, client),
        { goals: ["a"] },
      ],
      ["leaveRoomTimer", () => service.leaveRoomTimer({}, client)],
      ["startSolo", () => service.startSolo({ minutes: 25 } as never, client), { minutes: 25 }],
      ["endSolo", () => service.endSolo({}, client)],
      ["addGoal", () => service.addGoal({ text: "x" } as never, client), { text: "x" }],
      ["setGoalDone", () => service.setGoalDone({ goalId: "g" } as never, client), { goalId: "g" }],
      ["deleteGoal", () => service.deleteGoal({ goalId: "g" } as never, client), { goalId: "g" }],
      [
        "setGoalsPrivate",
        () => service.setGoalsPrivate({ goalsPrivate: true } as never, client),
        { goalsPrivate: true },
      ],
      ["getProgress", () => service.getProgress({}, client)],
      ["deleteMyData", () => service.deleteMyData({}, client)],
      ["setCardStyle", () => service.setCardStyle({ style: "ember" }, client), { style: "ember" }],
      [
        "setBadgeShowcase",
        () => service.setBadgeShowcase({ badgeIds: ["podium"] }, client),
        { badgeIds: ["podium"] },
      ],
      [
        "getLeaderboard",
        () => service.getLeaderboard({ by: 2, period: 3 }, client),
        { by: 2, period: 3 },
      ],
      [
        "setLeaderboardHidden",
        () => service.setLeaderboardHidden({ hidden: true, by: 1, period: 4 }, client),
        { hidden: true, by: 1, period: 4 },
      ],
      ["keepGoing", () => service.keepGoing({}, client)],
    ];
    for (const [name, call, request] of calls) {
      await expect(call()).resolves.toEqual({ from: name });
      const args = request === undefined ? ["ana"] : ["ana", request];
      expect(handlers[name]).toHaveBeenCalledWith(...args);
    }
  });

  it("answers 503 until handlers are bound", async () => {
    const service = new StudyRoomService();
    const error = await service.getRoom({}, client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RootServerException);
    expect(error).toMatchObject({ code: 503 });
  });

  it("turns RequestFailure into a RootServerException with the same code and message", async () => {
    const { service } = bound({
      addGoal: () => Promise.reject(new RequestFailure(429, "Slow down")),
    });
    const error = await service.addGoal({ text: "x" } as never, client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RootServerException);
    expect(error).toMatchObject({ code: 429, message: "Slow down" });
  });

  it("rethrows anything else unchanged", async () => {
    const boom = new Error("boom");
    const { service } = bound({ getProgress: () => Promise.reject(boom) });
    await expect(service.getProgress({}, client)).rejects.toBe(boom);
  });
});
