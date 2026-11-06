import { afterEach, describe, expect, it, vi } from "vitest";
import { roomFromProto } from "@studyroom/contract";
import type { MyStatusDto, RecapDto } from "@studyroom/core";
import type { RoomUpdatedEvent } from "@studyroom/gen-shared";
import { ChannelAnnouncer, type ChannelPort } from "../src/adapters/channelAnnouncer";
import { createLogger } from "../src/adapters/logger";
import { PushNotifier, type Broadcaster } from "../src/adapters/pushNotifier";
import { TimeoutScheduler } from "../src/adapters/timeoutScheduler";
import { createHarness } from "../../core/test/helpers";

describe("PushNotifier", () => {
  const broadcaster = (): Broadcaster<{ id: string }> &
    Record<string, ReturnType<typeof vi.fn>> => ({
    broadcastRoomUpdated: vi.fn(),
    broadcastPhaseCompleted: vi.fn(),
    broadcastPersonalResult: vi.fn(),
    broadcastMyStatus: vi.fn(),
    broadcastBadgesEarned: vi.fn(),
    broadcastHighFive: vi.fn(),
  });

  it("sends room events to everyone and personal events to one member", async () => {
    const b = broadcaster();
    const notifier = new PushNotifier(b, (userId) =>
      userId === "ana" ? { id: "ana-client" } : undefined,
    );
    const { engine } = createHarness();
    const snap = await engine.getSnapshot("ana");
    notifier.roomUpdated(snap.room);
    notifier.myStatusUpdated("ana", snap.me);
    notifier.myStatusUpdated("offline", snap.me as MyStatusDto);
    expect(b.broadcastRoomUpdated).toHaveBeenCalledWith({ room: expect.any(Object) }, "all");
    expect(b.broadcastMyStatus).toHaveBeenCalledTimes(1);
    expect(b.broadcastMyStatus).toHaveBeenCalledWith({ me: expect.any(Object) }, [
      { id: "ana-client" },
    ]);
  });

  /** Timers on a hand-moved clock, so bundling can be stepped through. */
  const manualTimers = () => {
    const t = {
      current: 0,
      due: null as { at: number; run: () => void } | null,
      now: () => t.current,
      setTimeout: (run: () => void, ms: number) => (t.due = { at: t.current + ms, run }),
      clearTimeout: () => {
        t.due = null;
      },
      advance(ms: number) {
        t.current += ms;
        if (t.due && t.due.at <= t.current) {
          const { run } = t.due;
          t.due = null;
          run();
        }
      },
    };
    return t;
  };
  const sentRooms = (b: ReturnType<typeof broadcaster>) =>
    vi
      .mocked(b.broadcastRoomUpdated)
      .mock.calls.map(([message]) => roomFromProto((message as RoomUpdatedEvent).room));

  it("bundles a burst of room changes into one push of the newest room", async () => {
    const b = broadcaster();
    const timers = manualTimers();
    const notifier = new PushNotifier(b, () => undefined, timers);
    const { engine } = createHarness();
    const room = (await engine.getSnapshot("ana")).room;
    // 50 people tick a goal in the same second.
    for (let i = 0; i < 50; i++) {
      notifier.roomUpdated({ ...room, presentCount: i, serverNow: 1_000 + i * 10 });
      timers.advance(10);
    }
    // The first goes out at once; the rest wait for the window to close.
    expect(b.broadcastRoomUpdated).toHaveBeenCalledTimes(1);
    // The window closes 1 s after the first push.
    timers.advance(499);
    expect(b.broadcastRoomUpdated).toHaveBeenCalledTimes(1);
    timers.advance(1);
    expect(b.broadcastRoomUpdated).toHaveBeenCalledTimes(2);
    const last = sentRooms(b).at(-1)!;
    expect(last).toMatchObject({ presentCount: 49 });
    // Its clock reading moved on by the 510 ms it waited (built at 490, sent at 1000).
    expect(last.serverNow).toBe(1_000 + 49 * 10 + 510);
    // A quiet room sends its next change straight away.
    timers.advance(5_000);
    notifier.roomUpdated(room);
    expect(b.broadcastRoomUpdated).toHaveBeenCalledTimes(3);
  });

  it("drops a waiting room push when a phase ends, since that event carries a newer room", async () => {
    const b = broadcaster();
    const timers = manualTimers();
    const notifier = new PushNotifier(b, () => undefined, timers);
    const { engine } = createHarness();
    const room = (await engine.getSnapshot("ana")).room;
    notifier.roomUpdated(room);
    notifier.roomUpdated(room);
    notifier.phaseCompleted({
      kind: "focus",
      round: 1,
      finisherIds: [],
      roomDamageXp: 0,
      combo: 1,
      room,
    });
    timers.advance(2_000);
    expect(b.broadcastRoomUpdated).toHaveBeenCalledTimes(1);
    expect(b.broadcastPhaseCompleted).toHaveBeenCalledTimes(1);
  });

  it("sends earned badges only to the member who earned them", () => {
    const b = broadcaster();
    const notifier = new PushNotifier(b, (userId) =>
      userId === "ana" ? { id: "ana-client" } : undefined,
    );
    notifier.badgesEarned("ana", ["night-owl"]);
    notifier.badgesEarned("offline", ["leet"]);
    expect(b.broadcastBadgesEarned).toHaveBeenCalledTimes(1);
    expect(b.broadcastBadgesEarned).toHaveBeenCalledWith({ badgeIds: ["night-owl"] }, [
      { id: "ana-client" },
    ]);
  });
});

describe("ChannelAnnouncer", () => {
  const port = () => {
    const posts: { channelId: string; content: string }[] = [];
    const channel: ChannelPort = {
      postMessage: vi.fn(async (channelId, content) => {
        posts.push({ channelId, content });
      }),
      nickname: vi.fn(async (userId: string) =>
        userId === "ana" ? "@everyone Ana **R.**" : undefined,
      ),
    };
    return { posts, channel };
  };

  it("sanitises nicknames before they reach a channel", async () => {
    const { posts, channel } = port();
    await new ChannelAnnouncer(channel).streakMilestone("c1", "ana", 30);
    expect(posts).toEqual([
      { channelId: "c1", content: "🔥 everyone Ana R. just hit a 30 day streak." },
    ]);
  });

  it("caches names and survives profile lookups failing", async () => {
    const { posts, channel } = port();
    let now = 0;
    const announcer = new ChannelAnnouncer(channel, () => now);
    await announcer.streakMilestone("c1", "ana", 7);
    await announcer.streakMilestone("c1", "ana", 30);
    expect(channel.nickname).toHaveBeenCalledTimes(1);
    now = 11 * 60 * 1000;
    vi.mocked(channel.nickname).mockRejectedValueOnce(new Error("404"));
    await announcer.streakMilestone("c1", "ana", 50);
    expect(posts.at(-1)?.content).toContain("Someone just hit a 50 day streak");
  });

  it("mentions the room with Root's markup in squad bot posts", async () => {
    const { posts, channel } = port();
    await new ChannelAnnouncer(channel).squadMessage(
      "c1",
      "breakStarted",
      "Take five. 🧠",
      ["ana", "kai", "bad id]"],
      undefined,
      true,
    );
    expect(posts[0]!.content).toBe(
      "[@everyone Ana R.](root://user/ana) [@Someone](root://user/kai) Someone Take five. 🧠",
    );
  });

  it("mentions everyone in a squad post, whatever characters their Root ids use", async () => {
    const { posts, channel } = port();
    // Real Root user ids: 22 base64url characters, often with "_" or "-".
    const ids = ["AbC_dEf-GhI_jKl-MnO_pQ", "zZ9_yY8-xX7_wW6-vV5_uU", "Qwerty12345Asdfgh67890"];
    await new ChannelAnnouncer(channel).squadMessage(
      "c1",
      "breakStarted",
      "Take five.",
      ids,
      undefined,
      true,
    );
    for (const id of ids) expect(posts[0]!.content).toContain(`](root://user/${id})`);
    expect(posts[0]!.content).toBe(
      "[@Someone](root://user/AbC_dEf-GhI_jKl-MnO_pQ) [@Someone](root://user/zZ9_yY8-xX7_wW6-vV5_uU) [@Someone](root://user/Qwerty12345Asdfgh67890) Take five.",
    );
  });

  it("writes plain names, with no pings, when bot mentions are off", async () => {
    const { posts, channel } = port();
    await new ChannelAnnouncer(channel).squadMessage("c1", "breakStarted", "Take five.", [
      "ana",
      "kai",
    ]);
    expect(posts[0]!.content).toBe("everyone Ana R. Someone Take five.");
    expect(posts[0]!.content).not.toContain("root://user/");
  });

  it("looks up only the members a squad post shows", async () => {
    const { posts, channel } = port();
    const ids = Array.from({ length: 13 }, (_, i) => `m${i}`);
    await new ChannelAnnouncer(channel).squadMessage("c1", "studyResumed", "Back to it.", ids);
    expect(channel.nickname).toHaveBeenCalledTimes(10);
    expect(posts[0]!.content).toContain("and 3 others Back to it.");
  });

  it("rolls a badge roundup into one post, mentioning only the members it shows", async () => {
    const { posts, channel } = port();
    const entries = Array.from({ length: 12 }, (_, i) => ({
      userId: i === 0 ? "ana" : `m${i}`,
      badges: "Squad Up",
    }));
    await new ChannelAnnouncer(channel).badgeRoundup("c1", entries, true);
    expect(posts).toHaveLength(1);
    expect(channel.nickname).toHaveBeenCalledTimes(10);
    const lines = posts[0]!.content.split("\n");
    expect(lines[0]).toBe("🏅 New badges for 12 people");
    expect(lines[1]).toBe("[@everyone Ana R.](root://user/ana): Squad Up");
    expect(lines.at(-1)).toBe("…and 2 others unlocked badges too.");
  });

  it("writes plain names in a badge roundup when bot mentions are off", async () => {
    const { posts, channel } = port();
    await new ChannelAnnouncer(channel).badgeRoundup("c1", [
      { userId: "ana", badges: "Night Owl" },
      { userId: "kai", badges: "Squad Up" },
    ]);
    expect(posts[0]!.content).toBe(
      "🏅 New badges for 2 people\neveryone Ana R.: Night Owl\nSomeone: Squad Up",
    );
  });

  it("posts recaps, busy rooms and boss defeats", async () => {
    const { posts, channel } = port();
    const announcer = new ChannelAnnouncer(channel);
    const recap: RecapDto = {
      day: "2026-10-27",
      weekday: "Tuesday",
      focusMinutes: 120,
      goalsDone: 3,
      activeMembers: 2,
      boss: { name: "<Midterms>", hpLeftXp: 1200, daysLeft: 4, defeated: false },
      topStreaks: [{ userId: "ana", streak: 31 }],
      topFocus: [{ userId: "ana", focusMinutes: 90 }],
    };
    await announcer.dailyRecap("c1", recap);
    await announcer.busyRoom("c1", 6, 1.5);
    await announcer.bossDefeated("c1", "Midterms", 9, 50);
    expect(posts[0]!.content).toContain("Top streaks: everyone Ana R. 31");
    expect(posts[0]!.content).toContain("This week: 1. everyone Ana R. 1.5 hrs");
    expect(channel.nickname).toHaveBeenCalledTimes(1);
    expect(posts[0]!.content).toContain("Midterms: down to 1,200 HP");
    expect(posts[0]!.content).not.toContain("<");
    expect(posts[1]!.content).toContain("6 people are focusing");
    expect(posts[2]!.content).toContain("defeated Midterms");
  });
});

describe("TimeoutScheduler", () => {
  afterEach(() => vi.useRealTimers());

  it("fires once at the requested time and replaces earlier wake-ups", () => {
    vi.useFakeTimers({ now: 0 });
    const scheduler = new TimeoutScheduler(() => Date.now());
    const first = vi.fn();
    const second = vi.fn();
    scheduler.wakeAt(1_000, first);
    scheduler.wakeAt(2_000, second);
    vi.advanceTimersByTime(1_999);
    expect(second).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("fires immediately for past times and can be cancelled", () => {
    vi.useFakeTimers({ now: 5_000 });
    const scheduler = new TimeoutScheduler(() => Date.now());
    const late = vi.fn();
    scheduler.wakeAt(1_000, late);
    vi.advanceTimersByTime(0);
    expect(late).toHaveBeenCalled();
    const cancelled = vi.fn();
    scheduler.wakeAt(9_000, cancelled);
    scheduler.cancel();
    vi.advanceTimersByTime(10_000);
    expect(cancelled).not.toHaveBeenCalled();
  });

  it("clamps very long delays instead of overflowing", () => {
    vi.useFakeTimers({ now: 0 });
    const scheduler = new TimeoutScheduler(() => Date.now());
    const cb = vi.fn();
    scheduler.wakeAt(60 * 24 * 60 * 60 * 1000, cb);
    vi.advanceTimersByTime(1_000);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_147_483_647);
    expect(cb).toHaveBeenCalled();
  });
});

describe("createLogger", () => {
  it("writes one JSON line per event to the right sink", () => {
    const lines: string[] = [];
    const errors: string[] = [];
    const logger = createLogger({
      info: (l) => lines.push(l),
      warn: (l) => lines.push(l),
      error: (l) => errors.push(l),
    });
    logger.info("started", { users: 3 });
    logger.error("boom");
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: "info", message: "started", users: 3 });
    expect(JSON.parse(errors[0]!)).toMatchObject({ level: "error", message: "boom" });
  });
});
