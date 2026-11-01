import { describe, expect, it } from "vitest";
import { MemoryStore, StudyRoomEngine, DEFAULT_CONFIG, type SnapshotDto } from "@studyroom/core";
import { initialRoomViewState, roomReducer, type RoomViewState } from "../src/state/roomState";

async function snapshot(): Promise<SnapshotDto> {
  const engine = new StudyRoomEngine({
    store: new MemoryStore(),
    clock: { now: () => 1_000 },
    scheduler: { wakeAt() {}, cancel() {} },
    notifier: {
      roomUpdated() {},
      phaseCompleted() {},
      personalResult() {},
      myStatusUpdated() {},
      badgesEarned() {},
    },
    announcer: {
      async busyRoom() {},
      async streakMilestone() {},
      async bossDefeated() {},
      async dailyRecap() {},
      async squadMessage() {},
    },
    logger: console,
    config: DEFAULT_CONFIG,
    newId: () => "g",
    random: () => 0.5,
  });
  return engine.getSnapshot("me");
}

describe("roomReducer", () => {
  it("becomes ready on the first snapshot", async () => {
    const snap = await snapshot();
    const state = roomReducer(initialRoomViewState, { type: "snapshot", snapshot: snap });
    expect(state.status).toBe("ready");
    expect(state.room).toBe(snap.room);
  });

  it("ignores pushes older than what it already has", async () => {
    const snap = await snapshot();
    const ready = roomReducer(initialRoomViewState, { type: "snapshot", snapshot: snap });
    const older = { ...snap.room, serverNow: 500, presentCount: 99 };
    expect(roomReducer(ready, { type: "roomUpdated", room: older }).room).toBe(snap.room);
    const newer = { ...snap.room, serverNow: 2_000, presentCount: 3 };
    expect(roomReducer(ready, { type: "roomUpdated", room: newer }).room?.presentCount).toBe(3);
  });

  it("starts a celebration when a focus round ends, but not a break", async () => {
    const snap = await snapshot();
    const ready = roomReducer(initialRoomViewState, { type: "snapshot", snapshot: snap });
    const event = {
      kind: "focus" as const,
      round: 2,
      finisherIds: ["a", "b"],
      roomDamageXp: 110,
      combo: 1.1,
      room: snap.room,
    };
    expect(roomReducer(ready, { type: "phaseCompleted", event, at: 5 }).celebration).toEqual({
      round: 2,
      finisherIds: ["a", "b"],
      combo: 1.1,
      startedAt: 5,
    });
    expect(
      roomReducer(ready, { type: "phaseCompleted", event: { ...event, kind: "break" }, at: 5 })
        .celebration,
    ).toBeNull();
  });

  it("tracks requests in flight and errors", () => {
    let state: RoomViewState = roomReducer(initialRoomViewState, { type: "requestStarted" });
    state = roomReducer(state, { type: "requestStarted" });
    expect(state.pending).toBe(2);
    state = roomReducer(state, { type: "requestFailed", message: "Nope" });
    expect(state).toMatchObject({ pending: 1, error: "Nope" });
    state = roomReducer(state, { type: "requestFinished" });
    state = roomReducer(state, { type: "requestFinished" });
    expect(state.pending).toBe(0);
    expect(roomReducer(state, { type: "dismissError" }).error).toBeNull();
  });

  it("shows a load error only before the first snapshot", async () => {
    const failed = roomReducer(initialRoomViewState, { type: "loadFailed", message: "offline" });
    expect(failed.status).toBe("error");
    const ready = roomReducer(initialRoomViewState, {
      type: "snapshot",
      snapshot: await snapshot(),
    });
    expect(roomReducer(ready, { type: "loadFailed", message: "offline" })).toMatchObject({
      status: "ready",
      error: "offline",
    });
  });

  it("queues each new badge once, however many ways it arrives", async () => {
    const snap = await snapshot();
    let state = roomReducer(initialRoomViewState, { type: "snapshot", snapshot: snap });
    // The reply to checking off a goal carries the badges.
    state = roomReducer(state, {
      type: "myStatus",
      me: { ...snap.me, newBadges: ["first-goal", "speedrun"] },
    });
    expect(state.newBadges).toEqual(["first-goal", "speedrun"]);
    // Then the badge push, and the status push, arrive with the same ones.
    state = roomReducer(state, { type: "badgesEarned", badgeIds: ["speedrun", "first-goal"] });
    state = roomReducer(state, {
      type: "myStatus",
      me: { ...snap.me, newBadges: ["first-goal", "speedrun"] },
    });
    expect(state.newBadges).toEqual(["first-goal", "speedrun"]);
    state = roomReducer(state, { type: "dismissBadge" });
    state = roomReducer(state, { type: "badgesEarned", badgeIds: ["first-goal"] });
    expect(state.newBadges).toEqual(["speedrun"]);
    // After "Delete my data", the same badges can be earned and shown again.
    state = roomReducer(state, { type: "badgesReset" });
    state = roomReducer(state, { type: "badgesEarned", badgeIds: ["first-goal"] });
    expect(state.newBadges).toEqual(["first-goal"]);
  });

  it("queues badges carried by a break result or snapshot", async () => {
    const snap = await snapshot();
    const state = roomReducer(initialRoomViewState, {
      type: "snapshot",
      snapshot: { ...snap, me: { ...snap.me, newBadges: ["squad-up"] } },
    });
    expect(state.newBadges).toEqual(["squad-up"]);
  });
});
