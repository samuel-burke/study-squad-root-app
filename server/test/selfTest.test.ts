import { DEFAULT_CONFIG } from "@studyroom/core";
import { describe, expect, it, vi } from "vitest";
import { StudyRoomHandlers } from "../src/handlers";
import { SelfTest, shapeOf, type SelfTestDeps } from "../src/selfTest";

const quiet = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function deps(overrides: Partial<SelfTestDeps> = {}) {
  let now = 1_000_000;
  const scheduled: { tag: string; at: Date }[] = [];
  const pings: string[] = [];
  const d: SelfTestDeps = {
    build: {
      version: "1.2.3",
      genVersion: "1.0.0-proto.abc",
      selfTestUserIds: ["dev"],
      settingTypes: { room: { busyThreshold: "number", squadBot: "checkbox" } },
    },
    loadedGenVersion: () => "1.0.0-proto.abc",
    rawSettings: () => ({ room: { busyThreshold: { value: 5 }, squadBot: true } }),
    config: () => DEFAULT_CONFIG,
    db: {
      migrations: async () => ({ current: "010", done: 10, pending: 0 }),
      roundTrip: async (value) => value,
    },
    jobs: {
      schedule: async (tag, at) => void scheduled.push({ tag, at }),
      cancel: async () => {},
    },
    ping: (_userId, nonce) => (pings.push(nonce), true),
    getClientFinds: () => false,
    channels: async () => [
      { id: "t", name: "general", voice: false },
      { id: "v", name: "Hall", voice: true },
    ],
    post: vi.fn(async () => {}),
    attachedUserIds: () => ["dev", "ana"],
    nickname: async () => "Dev",
    isAdmin: async () => true,
    now: () => now,
    logger: quiet,
    ...overrides,
  };
  return { d, scheduled, pings, tick: (ms: number) => (now += ms) };
}

const check = (t: SelfTest, id: string) => t.report()!.checks.find((c) => c.id === id)!;

describe("shapeOf", () => {
  it("describes what Root sent", () => {
    expect(shapeOf({ value: 5 })).toBe("object{value:number}");
    expect(shapeOf(["25-5"])).toBe("array<string>");
    expect(shapeOf(undefined)).toBe("missing");
    expect(shapeOf({ hours: 21, minutes: 0, seconds: 0 })).toBe(
      "object{hours:number,minutes:number,seconds:number}",
    );
    expect(shapeOf(new Date(0))).toBe("Date");
  });
});

describe("SelfTest", () => {
  it("passes everything that can be checked at once, and waits on the ping and the job", async () => {
    const { d, scheduled, pings } = deps();
    const t = new SelfTest(d);
    await t.start("dev", {
      testPost: false,
      client: { version: "1.2.3", genVersion: "1.0.0-proto.abc", userId: "dev" },
    });
    const statuses = Object.fromEntries(t.report()!.checks.map((c) => [c.id, c.status]));
    expect(statuses).toEqual({
      versions: "pass",
      settings: "pass",
      database: "pass",
      push: "pending",
      jobs: "pending",
      channels: "pass",
      members: "pass",
      client: "pass",
    });
    expect(t.report()!.done).toBe(false);
    expect(scheduled).toHaveLength(1);
    expect(check(t, "push").detail).toContain("still finds no one");

    t.confirmPing("dev", pings[0]!);
    t.onJob({ tag: scheduled[0]!.tag, jobTime: scheduled[0]!.at.getTime(), missed: false });
    expect(check(t, "push").status).toBe("pass");
    expect(check(t, "jobs").status).toBe("pass");
    expect(check(t, "jobs").detail).toContain("jobTime arrived as number");
    expect(t.report()!.done).toBe(true);
  });

  it("flags a stale networking package and a version mismatch", async () => {
    const { d } = deps({ loadedGenVersion: () => "1.0.0-proto.old" });
    const t = new SelfTest(d);
    await t.start("dev", { testPost: false, client: { version: "1.2.2", userId: "dev" } });
    const versions = check(t, "versions");
    expect(versions.status).toBe("fail");
    expect(versions.detail).toContain("stale cached copy");
    expect(versions.detail).toContain("Your app is 1.2.2");
  });

  it("warns when Root sends a setting in a shape the fake Root host doesn't use", async () => {
    const { d } = deps({ rawSettings: () => ({ room: { busyThreshold: 5 } }) });
    const t = new SelfTest(d);
    await t.start("dev", { testPost: false, client: { userId: "dev" } });
    expect(check(t, "settings").status).toBe("warn");
    expect(check(t, "settings").detail).toContain("room.busyThreshold (number) came as number");
  });

  it("warns when jobTime turns into a Date, and ignores other jobs", async () => {
    const { d, scheduled } = deps();
    const t = new SelfTest(d);
    await t.start("dev", { testPost: false, client: { userId: "dev" } });
    t.onJob({ tag: "daily-recap", jobTime: 0, missed: false });
    expect(check(t, "jobs").status).toBe("pending");
    t.onJob({ tag: scheduled[0]!.tag, jobTime: scheduled[0]!.at, missed: false });
    expect(check(t, "jobs").status).toBe("warn");
  });

  it("never throws from a job handler", () => {
    const t = new SelfTest(deps().d);
    expect(() =>
      t.onJob({ tag: "self-test", jobTime: Symbol("odd"), missed: false }),
    ).not.toThrow();
  });

  it("fails the ping and the job when they never come", async () => {
    const { d, tick } = deps();
    const t = new SelfTest(d);
    await t.start("dev", { testPost: false, client: { userId: "dev" } });
    tick(30_000);
    expect(check(t, "push").status).toBe("fail");
    tick(5 * 60_000);
    expect(check(t, "jobs").status).toBe("fail");
    expect(t.report()!.done).toBe(true);
  });

  it("ignores a ping answer from someone else", async () => {
    const { d, pings } = deps();
    const t = new SelfTest(d);
    await t.start("dev", { testPost: false, client: { userId: "dev" } });
    t.confirmPing("ana", pings[0]!);
    t.confirmPing("dev", "wrong");
    expect(check(t, "push").status).toBe("pending");
  });

  it("sends a test post only when asked, to the bot channel", async () => {
    const post = vi.fn(async () => {});
    const { d, tick } = deps({
      post,
      config: () => ({ ...DEFAULT_CONFIG, postChannelId: "t", postChannelName: "general" }),
    });
    const t = new SelfTest(d);
    await t.start("dev", { testPost: false, client: { userId: "dev" } });
    expect(post).not.toHaveBeenCalled();
    tick(60_000);
    await t.start("dev", { testPost: true, client: { userId: "dev" } });
    expect(post).toHaveBeenCalledWith("t", expect.stringContaining("only a test"));
  });

  it("turns a throwing check into a failed row and runs the rest", async () => {
    const { d } = deps({ channels: async () => Promise.reject(new Error("no access")) });
    const t = new SelfTest(d);
    await t.start("dev", { testPost: false, client: { userId: "dev" } });
    expect(check(t, "channels")).toMatchObject({
      status: "fail",
      detail: expect.stringContaining("no access"),
    });
    expect(check(t, "members").status).toBe("pass");
  });

  it("is allowed only for a listed user", () => {
    const t = new SelfTest(deps().d);
    expect(t.allowed("dev")).toBe(true);
    expect(t.allowed("ana")).toBe(false);
    const nobody = new SelfTest(
      deps({ build: { version: "1", genVersion: "g", selfTestUserIds: [] } }).d,
    );
    expect(nobody.allowed("dev")).toBe(false);
  });

  it("makes you wait a minute between runs", async () => {
    const { d, tick } = deps();
    const t = new SelfTest(d);
    await t.start("dev", { testPost: false, client: { userId: "dev" } });
    tick(30_000);
    await expect(
      t.start("dev", { testPost: false, client: { userId: "dev" } }),
    ).rejects.toMatchObject({ code: 1004, message: expect.stringContaining("30s") });
    tick(30_000);
    await t.start("dev", { testPost: false, client: { userId: "dev" } });
  });
});

describe("self-test handlers", () => {
  const engine = {} as never;

  it("refuses everyone not on the list, on every call", async () => {
    const h = new StudyRoomHandlers(engine, quiet, { selfTest: new SelfTest(deps().d) });
    await expect(h.runSelfTest("ana", { testPost: false, clientJson: "{}" })).rejects.toMatchObject(
      { code: 1005 },
    );
    await expect(h.confirmSelfTestPing("ana", { nonce: "x" })).rejects.toMatchObject({
      code: 1005,
    });
    const state = await h.getSelfTest("ana");
    expect(state).toMatchObject({
      allowed: false,
      reportJson: "",
    });
  });

  it("runs for the developer and returns the report as JSON", async () => {
    const h = new StudyRoomHandlers(engine, quiet, { selfTest: new SelfTest(deps().d) });
    const state = await h.runSelfTest("dev", {
      testPost: false,
      clientJson: "not json",
    });
    expect(state.allowed).toBe(true);
    const report = JSON.parse(state.reportJson);
    expect(report.app.version).toBe("1.2.3");
    expect(report.checks.map((c: { id: string }) => c.id)).toContain("jobs");
  });
});
