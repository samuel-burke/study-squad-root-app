import { DomainError, ErrorCode, type ScheduledSessionDto } from "@studyroom/core";
import { describe, expect, it, vi } from "vitest";
import { SCHEDULE_KEY, SessionSchedule } from "../src/jobs/sessionSchedule";
import { KnexStore } from "../src/persistence/knexStore";
import { freshDatabase } from "./sqlite";

const HOUR = 60 * 60 * 1000;
// Wed 2026-11-11 12:00 UTC.
const T0 = Date.UTC(2026, 10, 11, 12);
const NAMES: Record<string, string> = { devon: "Devon", ana: "Ana R.", kai: "Kai" };

async function setup() {
  const db = await freshDatabase();
  const store = new KnexStore(db);
  let clock = T0;
  let ids = 0;
  const jobs = new Map<string, Date>();
  const posts: string[] = [];
  const pushes: ScheduledSessionDto[][] = [];
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const schedule = new SessionSchedule({
    store: store.kv,
    scheduleOnce: async (tag, at) => {
      jobs.set(tag, at);
    },
    cancelByTag: async (tag) => {
      jobs.delete(tag);
    },
    post: async (content) => {
      posts.push(content);
    },
    nickname: async (userId) => NAMES[userId],
    changed: (sessions) => pushes.push(sessions),
    timeZone: () => "America/New_York",
    newId: () => `s${++ids}`,
    now: () => clock,
    logger,
  });
  return {
    db,
    store,
    schedule,
    jobs,
    posts,
    pushes,
    logger,
    setNow: (t: number) => {
      clock = t;
    },
  };
}

async function rejects(work: Promise<unknown>, code: number) {
  const error = await work.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

describe("SessionSchedule", () => {
  it("lets anyone schedule, queues a one-time job and announces it", async () => {
    const { db, schedule, jobs, posts, pushes } = await setup();
    try {
      // Sunday 2026-11-15, 7pm in New York (EST, UTC-5).
      const at = Date.UTC(2026, 10, 16, 0);
      const list = await schedule.add("devon", "  Sunday   exam cram ", at);
      expect(list).toEqual([
        {
          id: "s1",
          title: "Sunday exam cram",
          startsAtMs: at,
          byUserId: "devon",
          goingUserIds: ["devon"],
        },
      ]);
      expect(jobs.get("session:s1")).toEqual(new Date(at));
      expect(posts).toEqual([
        '📅 Devon scheduled **Sunday exam cram** for Sunday, Nov 15, 7:00 PM EST. Tap "I\'m in" in Study Squad to get a ping when it starts.',
      ]);
      expect(pushes.at(-1)).toEqual(list);
    } finally {
      await db.destroy();
    }
  });

  it("lists upcoming sessions soonest first", async () => {
    const { db, schedule } = await setup();
    try {
      await schedule.add("ana", "Later", T0 + 5 * HOUR);
      await schedule.add("kai", "Sooner", T0 + 2 * HOUR);
      expect((await schedule.list()).map((s) => s.title)).toEqual(["Sooner", "Later"]);
    } finally {
      await db.destroy();
    }
  });

  it("rejects blank or long names, past times, far-off times and a fourth session", async () => {
    const { db, schedule, jobs } = await setup();
    try {
      await rejects(schedule.add("ana", "   ", T0 + HOUR), ErrorCode.Validation);
      await rejects(schedule.add("ana", 42, T0 + HOUR), ErrorCode.Validation);
      await rejects(schedule.add("ana", "x".repeat(61), T0 + HOUR), ErrorCode.Validation);
      await rejects(schedule.add("ana", "Cram", T0), ErrorCode.Validation);
      await rejects(schedule.add("ana", "Cram", "soon"), ErrorCode.Validation);
      await rejects(schedule.add("ana", "Cram", T0 + 31 * 24 * HOUR), ErrorCode.Validation);
      for (let i = 1; i <= 3; i++) await schedule.add("ana", `Cram ${i}`, T0 + i * HOUR);
      await rejects(schedule.add("ana", "Cram 4", T0 + 4 * HOUR), ErrorCode.Validation);
      // Someone else can still schedule.
      await schedule.add("kai", "Kai's", T0 + HOUR);
      expect(jobs.size).toBe(4);
    } finally {
      await db.destroy();
    }
  });

  it("toggles RSVPs and keeps each member in once", async () => {
    const { db, schedule } = await setup();
    try {
      await schedule.add("devon", "Cram", T0 + HOUR);
      await schedule.rsvp("ana", "s1", true);
      await schedule.rsvp("ana", "s1", true);
      expect((await schedule.list())[0]!.goingUserIds).toEqual(["devon", "ana"]);
      await schedule.rsvp("devon", "s1", false);
      expect((await schedule.list())[0]!.goingUserIds).toEqual(["ana"]);
      await rejects(schedule.rsvp("ana", "nope", true), ErrorCode.NotFound);
      await rejects(schedule.rsvp("ana", "../x", true), ErrorCode.Validation);
    } finally {
      await db.destroy();
    }
  });

  it("only lets the scheduler cancel, and drops the job", async () => {
    const { db, schedule, jobs } = await setup();
    try {
      await schedule.add("devon", "Cram", T0 + HOUR);
      await rejects(schedule.cancel("ana", "s1"), ErrorCode.Forbidden);
      expect(await schedule.cancel("devon", "s1")).toEqual([]);
      expect(jobs.size).toBe(0);
      await rejects(schedule.cancel("devon", "s1"), ErrorCode.NotFound);
    } finally {
      await db.destroy();
    }
  });

  it("posts the reminder when the job fires, pinging everyone who's in", async () => {
    const { db, schedule, posts, setNow } = await setup();
    try {
      await schedule.add("devon", "Cram", T0 + HOUR);
      await schedule.rsvp("ana", "s1", true);
      setNow(T0 + HOUR);
      await schedule.onJob("session:s1");
      expect(posts.at(-1)).toBe(
        "⏰ **Cram** starts now! [@Devon](root://user/devon) [@Ana R.](root://user/ana) Open Study Squad and join the room timer.",
      );
      expect(await schedule.list()).toEqual([]);
      // A repeat delivery finds nothing and stays quiet.
      await schedule.onJob("session:s1");
      expect(posts).toHaveLength(2);
    } finally {
      await db.destroy();
    }
  });

  it("pings at most ten and counts the rest", async () => {
    const { db, schedule, posts, setNow } = await setup();
    try {
      await schedule.add("devon", "Cram", T0 + HOUR);
      for (let i = 0; i < 11; i++) await schedule.rsvp(`m${i}`, "s1", true);
      setNow(T0 + HOUR);
      await schedule.onJob("session:s1");
      expect(posts.at(-1)).toContain("+2 more Open");
      expect(posts.at(-1)!.match(/root:\/\/user/g)).toHaveLength(10);
    } finally {
      await db.destroy();
    }
  });

  it("skips a reminder that fires hours late, and ignores other jobs", async () => {
    const { db, schedule, posts, setNow } = await setup();
    try {
      await schedule.add("devon", "Cram", T0 + HOUR);
      await schedule.onJob("daily-recap");
      await schedule.onJob(null);
      setNow(T0 + 4 * HOUR);
      await schedule.onJob("session:s1");
      expect(posts).toHaveLength(1);
    } finally {
      await db.destroy();
    }
  });

  it("strips markup and mentions from the title in posts", async () => {
    const { db, schedule, posts } = await setup();
    try {
      await schedule.add("kai", "@everyone **[free](x)**", T0 + HOUR);
      expect(posts[0]).toContain("**everyone freex**");
    } finally {
      await db.destroy();
    }
  });

  it("still saves the session when the channel post fails", async () => {
    const { db, store, schedule, logger } = await setup();
    try {
      const failing = new SessionSchedule({
        ...(schedule as unknown as { deps: ConstructorParameters<typeof SessionSchedule>[0] }).deps,
        post: async () => {
          throw new Error("no channel");
        },
      });
      await failing.add("kai", "Cram", T0 + HOUR);
      expect(await store.kv.get(SCHEDULE_KEY)).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalled();
    } finally {
      await db.destroy();
    }
  });

  it("forgets a member's sessions and RSVPs on delete my data", async () => {
    const { db, schedule, jobs } = await setup();
    try {
      await schedule.add("ana", "Ana's", T0 + HOUR);
      await schedule.add("devon", "Devon's", T0 + 2 * HOUR);
      await schedule.rsvp("ana", "s2", true);
      await schedule.forget("ana");
      expect(await schedule.list()).toEqual([
        expect.objectContaining({ id: "s2", goingUserIds: ["devon"] }),
      ]);
      expect([...jobs.keys()]).toEqual(["session:s2"]);
    } finally {
      await db.destroy();
    }
  });
});
