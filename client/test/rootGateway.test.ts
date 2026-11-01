import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  leaderboardMetricToProto,
  leaderboardPeriodToProto,
  leaderboardToProto,
  memberProfileToProto,
  myStatusToProto,
  progressToProto,
  snapshotToProto,
} from "@studyroom/contract";
import { createHarness } from "../../core/test/helpers";
import { GatewayError } from "../src/api/gateway";
import { RootGateway } from "../src/api/rootGateway";

// Root's client SDK only works inside the Root app, so mock the SDK and the
// generated service client and drive them from the tests.
const sdk = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(() => "ana"),
  getUserProfiles: vi.fn(),
  toImageUrl: vi.fn((uri: string) => `https://cdn.test/${uri}`),
}));
const service = vi.hoisted(() => {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    listeners,
    emit: (name: string, event: unknown) => listeners.get(name)?.forEach((l) => l(event)),
    client: {
      on: vi.fn((name: string, listener: (event: unknown) => void) => {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name)!.add(listener);
      }),
      off: vi.fn((name: string, listener: (event: unknown) => void) =>
        listeners.get(name)?.delete(listener),
      ),
      getRoom: vi.fn(),
      joinRoomTimer: vi.fn(),
      leaveRoomTimer: vi.fn(),
      startSolo: vi.fn(),
      endSolo: vi.fn(),
      addGoal: vi.fn(),
      setGoalDone: vi.fn(),
      deleteGoal: vi.fn(),
      setGoalsPrivate: vi.fn(),
      deleteMyData: vi.fn(),
      keepGoing: vi.fn(),
      getProgress: vi.fn(),
      getLeaderboard: vi.fn(),
      setLeaderboardHidden: vi.fn(),
      getMemberProfile: vi.fn(),
    },
  };
});

vi.mock("@rootsdk/client-app", () => ({
  ImageUriResolution: { Small: "small" },
  rootClient: {
    users: { getCurrentUserId: sdk.getCurrentUserId, getUserProfiles: sdk.getUserProfiles },
    assets: { toImageUrl: sdk.toImageUrl },
  },
}));
vi.mock("@studyroom/gen-client", () => ({
  studyRoomServiceClient: service.client,
  StudyRoomServiceClientEvent: {
    RoomUpdated: "roomUpdated",
    PhaseCompleted: "phaseCompleted",
    PersonalResult: "personalResult",
    MyStatus: "myStatus",
    BadgesEarned: "badgesEarned",
  },
}));

async function realSnapshot() {
  const { engine } = createHarness();
  return engine.joinRoomTimer("ana", { goals: ["Read ch. 4"] });
}

beforeEach(() => {
  vi.clearAllMocks();
  service.listeners.clear();
});

describe("RootGateway", () => {
  it("reads the current user from Root", () => {
    expect(new RootGateway().currentUserId()).toBe("ana");
  });

  it("converts snapshots and syncs the clock to the server", async () => {
    const snapshot = await realSnapshot();
    const proto = snapshotToProto(snapshot);
    for (const rpc of ["getRoom", "joinRoomTimer", "leaveRoomTimer", "startSolo", "endSolo"])
      vi.mocked(service.client[rpc as "getRoom"]).mockResolvedValue(proto);
    const gateway = new RootGateway();
    const results = [
      await gateway.getSnapshot(),
      await gateway.joinRoomTimer({ goals: ["Read ch. 4"], goalsPrivate: true }),
      await gateway.leaveRoomTimer(),
      await gateway.startSolo(25, { goals: [], goalsPrivate: false }),
      await gateway.endSolo(),
    ];
    for (const result of results) expect(result.me.goals[0]?.text).toBe("Read ch. 4");
    expect(service.client.joinRoomTimer).toHaveBeenCalledWith({
      goals: ["Read ch. 4"],
      goalsPrivate: true,
    });
    expect(service.client.startSolo).toHaveBeenCalledWith({
      minutes: 25,
      goals: [],
      goalsPrivate: false,
    });
    // The server clock (a fixed test time) wins over this device clock.
    expect(Math.abs(gateway.now() - snapshot.room.serverNow)).toBeLessThan(60_000);
  });

  it("converts goal and data calls", async () => {
    const me = (await realSnapshot()).me;
    const proto = myStatusToProto(me);
    for (const rpc of [
      "addGoal",
      "setGoalDone",
      "deleteGoal",
      "setGoalsPrivate",
      "deleteMyData",
      "keepGoing",
    ])
      vi.mocked(service.client[rpc as "addGoal"]).mockResolvedValue(proto);
    const gateway = new RootGateway();
    await expect(gateway.addGoal("x")).resolves.toEqual(me);
    await expect(gateway.setGoalDone("g", true)).resolves.toEqual(me);
    await expect(gateway.deleteGoal("g")).resolves.toEqual(me);
    await expect(gateway.setGoalsPrivate(false)).resolves.toEqual(me);
    await expect(gateway.deleteMyData()).resolves.toEqual(me);
    await expect(gateway.keepGoing()).resolves.toEqual(me);
    expect(service.client.keepGoing).toHaveBeenCalledWith({});
    expect(service.client.setGoalDone).toHaveBeenCalledWith({ goalId: "g", done: true });
  });

  it("loads progress", async () => {
    const { engine } = createHarness();
    const progress = await engine.getProgress("ana");
    vi.mocked(service.client.getProgress).mockResolvedValue(progressToProto(progress));
    await expect(new RootGateway().getProgress()).resolves.toEqual(progress);
  });

  it("loads the leaderboard and saves the opt-out", async () => {
    const { engine, store } = createHarness();
    await store.stats.add("kai", "2026-10-27", { focusMinutes: 42 });
    const board = await engine.getLeaderboard("ana");
    const hidden = await engine.setLeaderboardHidden("ana", true);
    vi.mocked(service.client.getLeaderboard).mockResolvedValue(leaderboardToProto(board));
    vi.mocked(service.client.setLeaderboardHidden).mockResolvedValue(leaderboardToProto(hidden));
    const gateway = new RootGateway();
    await expect(gateway.getLeaderboard()).resolves.toEqual(board);
    await expect(gateway.setLeaderboardHidden(true)).resolves.toEqual(hidden);
    expect(service.client.getLeaderboard).toHaveBeenCalledWith({
      by: leaderboardMetricToProto("minutes"),
      period: leaderboardPeriodToProto("week"),
    });
    expect(service.client.setLeaderboardHidden).toHaveBeenCalledWith({
      hidden: true,
      by: leaderboardMetricToProto("minutes"),
      period: leaderboardPeriodToProto("week"),
    });

    const byXp = await engine.getLeaderboard("kai", "xp", "all");
    vi.mocked(service.client.getLeaderboard).mockResolvedValue(leaderboardToProto(byXp));
    await expect(gateway.getLeaderboard("xp", "all")).resolves.toEqual(byXp);
    await gateway.setLeaderboardHidden(false, "xp", "month");
    expect(service.client.getLeaderboard).toHaveBeenLastCalledWith({
      by: leaderboardMetricToProto("xp"),
      period: leaderboardPeriodToProto("all"),
    });
    expect(service.client.setLeaderboardHidden).toHaveBeenLastCalledWith({
      hidden: false,
      by: leaderboardMetricToProto("xp"),
      period: leaderboardPeriodToProto("month"),
    });
  });

  it("looks up another member's profile", async () => {
    const { engine, store } = createHarness();
    await store.badges.award({ userId: "kai", badgeId: "leet", earnedAt: 1 });
    const profile = await engine.getMemberProfile("kai");
    vi.mocked(service.client.getMemberProfile).mockResolvedValue(memberProfileToProto(profile));
    await expect(new RootGateway().getMemberProfile("kai")).resolves.toEqual(profile);
    expect(service.client.getMemberProfile).toHaveBeenCalledWith({ userId: "kai" });
  });

  it("turns leaderboard failures into GatewayErrors", async () => {
    const gateway = new RootGateway();
    vi.mocked(service.client.getLeaderboard).mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(gateway.getLeaderboard()).rejects.toMatchObject({ code: 0 });
    vi.mocked(service.client.setLeaderboardHidden).mockRejectedValue({
      code: 8,
      message: "Slow down a little and try again.",
    });
    const error = await gateway.setLeaderboardHidden(true).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GatewayError);
    expect(error).toMatchObject({ code: 8, message: "Slow down a little and try again." });
  });

  it("keeps server error messages and hides network failures", async () => {
    const gateway = new RootGateway();
    vi.mocked(service.client.addGoal).mockRejectedValue({ code: 1001, message: "Too long." });
    await expect(gateway.addGoal("x")).rejects.toMatchObject({ code: 1001, message: "Too long." });
    vi.mocked(service.client.getRoom).mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await gateway.getSnapshot().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GatewayError);
    expect(error).toMatchObject({ code: 0 });
  });

  it("maps profiles and skips the call for no ids", async () => {
    const gateway = new RootGateway();
    await expect(gateway.getProfiles([])).resolves.toEqual([]);
    expect(sdk.getUserProfiles).not.toHaveBeenCalled();
    sdk.getUserProfiles.mockResolvedValue([
      { id: "ana", nickname: "Ana", profilePictureUri: "ana.png" },
      { id: "kai", nickname: "Kai" },
    ]);
    await expect(gateway.getProfiles(["ana", "kai"])).resolves.toEqual([
      { userId: "ana", name: "Ana", avatarUrl: "https://cdn.test/ana.png" },
      { userId: "kai", name: "Kai", avatarUrl: undefined },
    ]);
  });

  it("turns a failed profile lookup into a GatewayError", async () => {
    sdk.getUserProfiles.mockRejectedValue(new Error("socket closed"));
    await expect(new RootGateway().getProfiles(["ana"])).rejects.toBeInstanceOf(GatewayError);
  });

  it("forwards pushes and unsubscribes cleanly", async () => {
    const snapshot = await realSnapshot();
    const proto = snapshotToProto(snapshot);
    const handlers = {
      roomUpdated: vi.fn(),
      phaseCompleted: vi.fn(),
      personalResult: vi.fn(),
      myStatus: vi.fn(),
      badgesEarned: vi.fn(),
    };
    const unsubscribe = new RootGateway().subscribe(handlers);
    service.emit("roomUpdated", { room: proto.room });
    service.emit("myStatus", { me: proto.me });
    service.emit("phaseCompleted", {});
    service.emit("personalResult", {});
    service.emit("badgesEarned", { badgeIds: ["first-focus"] });
    expect(handlers.roomUpdated.mock.calls[0]?.[0]).toMatchObject({
      serverNow: snapshot.room.serverNow,
    });
    expect(handlers.myStatus).toHaveBeenCalledWith(snapshot.me);
    expect(handlers.phaseCompleted).toHaveBeenCalledTimes(1);
    expect(handlers.personalResult).toHaveBeenCalledTimes(1);
    expect(handlers.badgesEarned).toHaveBeenCalledWith(["first-focus"]);
    unsubscribe();
    expect([...service.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });
});
