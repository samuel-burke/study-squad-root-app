import { randomUUID } from "node:crypto";
import { DomainError, ErrorCode, type AppConfig, type Logger } from "@studyroom/core";
import type { ChannelInfo } from "./wiring";

/**
 * The owner-only self-test panel's checks, run live on Root. Each one looks
 * at a part of Root that has surprised us before and reports what it saw,
 * including the raw shapes, so the fake Root host (fake-root/) can be kept
 * honest. Nothing here touches members' data: the database check uses its
 * own row, and the job check its own tag.
 */

export type CheckStatus = "pass" | "warn" | "fail" | "pending";

export interface Check {
  id: string;
  title: string;
  status: CheckStatus;
  /** One or two plain sentences on what was seen. */
  detail: string;
  /** What Root actually handed us, for the report. */
  raw?: unknown;
}

export interface SelfTestReport {
  app: { version: string; genVersion: string };
  startedAt: string;
  done: boolean;
  checks: Check[];
}

/** What the client saw of Root, sent with the run. */
export interface ClientInfo {
  version?: string;
  genVersion?: string;
  userId?: string;
  theme?: unknown;
  profile?: unknown;
}

export interface BuildInfo {
  version: string;
  genVersion: string;
  selfTestUserIds: string[];
  /** Root community ids it may run in: the staging community. */
  selfTestCommunityIds: string[];
  /** Setting types by group and key, from root-manifest.json. */
  settingTypes?: Record<string, Record<string, string>>;
}

export interface SelfTestDeps {
  build: BuildInfo;
  /** The version of the networking code the server actually loaded. */
  loadedGenVersion(): string;
  rawSettings(): unknown;
  config(): AppConfig;
  db: {
    migrations(): Promise<{ current: string; done: number; pending: number }>;
    /** Writes, reads back and deletes a row of its own. Returns what was read. */
    roundTrip(value: string): Promise<string | undefined>;
  };
  jobs: {
    schedule(tag: string, at: Date): Promise<void>;
    cancel(tag: string): Promise<void>;
  };
  /** Pushes a ping to the caller's own client. False if none was found. */
  ping(userId: string, nonce: string): boolean;
  /** Whether the SDK's clients.getClient(userId) finds the caller (it never has). */
  getClientFinds(userId: string): boolean;
  channels(): Promise<ChannelInfo[]>;
  post(channelId: string, content: string): Promise<void>;
  attachedUserIds(): string[];
  nickname(userId: string): Promise<string>;
  isAdmin(userId: string): Promise<boolean>;
  now(): number;
  logger: Logger;
}

export const SELF_TEST_JOB_TAG = "self-test";
const JOB_DELAY_MS = 30_000;
/** Root checks for due jobs about once a minute, so allow a few. */
const JOB_TIMEOUT_MS = 4 * 60_000;
const PING_TIMEOUT_MS = 20_000;
/** Each run can make a test post and books a job, so runs are spaced out. */
export const RUN_COOLDOWN_MS = 60_000;

/** The shapes the fake Root host delivers settings in, by manifest item type. */
export const FAKE_SETTING_SHAPES: Record<string, string> = {
  number: "object{value:number}",
  checkbox: "boolean",
  select: "array<string>",
  channel: "array<string>",
  time: "object{hours:number,minutes:number,seconds:number}",
};

/** A short description of a value's shape, e.g. "object{value:number}". */
export function shapeOf(value: unknown): string {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const inner = [...new Set(value.map(shapeOf))];
    return `array<${inner.join("|") || "empty"}>`;
  }
  if (value instanceof Date) return "Date";
  if (typeof value === "object") {
    const fields = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}:${shapeOf(v)}`)
      .sort();
    return `object{${fields.join(",")}}`;
  }
  return typeof value;
}

interface Run {
  userId: string;
  startedAt: number;
  report: SelfTestReport;
  pingNonce: string;
  pingSentAt: number;
  jobTag: string;
  jobDueAt: number;
}

export class SelfTest {
  private run: Run | null = null;

  constructor(private readonly deps: SelfTestDeps) {}

  /** A listed user, but in a community that isn't listed (worth a log line). */
  listedElsewhere(userId: string, communityId: string): boolean {
    const { selfTestUserIds, selfTestCommunityIds } = this.deps.build;
    return selfTestUserIds.includes(userId) && !selfTestCommunityIds.includes(communityId);
  }

  /**
   * Only a listed user, in a listed community (staging). Both ids come from
   * Root's authenticated connection, never from the request. An empty list
   * means nobody, anywhere.
   */
  allowed(userId: string, communityId: string): boolean {
    const { selfTestUserIds, selfTestCommunityIds } = this.deps.build;
    return selfTestUserIds.includes(userId) && selfTestCommunityIds.includes(communityId);
  }

  /** The latest report, with timed-out checks marked failed. */
  report(): SelfTestReport | null {
    if (!this.run) return null;
    const now = this.deps.now();
    const { report } = this.run;
    this.update("push", (c) =>
      c.status === "pending" && now - this.run!.pingSentAt > PING_TIMEOUT_MS
        ? {
            ...c,
            status: "fail",
            detail: `Your screen didn't confirm the ping within ${PING_TIMEOUT_MS / 1000}s. ${c.detail}`,
          }
        : c,
    );
    this.update("jobs", (c) =>
      c.status === "pending" && now - this.run!.jobDueAt > JOB_TIMEOUT_MS
        ? {
            ...c,
            status: "fail",
            detail: `Root never ran the test job, ${Math.round(JOB_TIMEOUT_MS / 60_000)} minutes after it was due.`,
          }
        : c,
    );
    report.done = report.checks.every((c) => c.status !== "pending");
    return report;
  }

  async start(userId: string, options: { testPost: boolean; client: ClientInfo }): Promise<void> {
    const now = this.deps.now();
    if (this.run && now - this.run.startedAt < RUN_COOLDOWN_MS) {
      const wait = Math.ceil((RUN_COOLDOWN_MS - (now - this.run.startedAt)) / 1000);
      throw new DomainError(
        ErrorCode.RateLimited,
        `Wait ${wait}s before running the self-test again.`,
      );
    }
    const run: Run = {
      userId,
      startedAt: now,
      pingNonce: randomUUID(),
      pingSentAt: now,
      jobTag: SELF_TEST_JOB_TAG,
      jobDueAt: now + JOB_DELAY_MS,
      report: {
        app: { version: this.deps.build.version, genVersion: this.deps.build.genVersion },
        startedAt: new Date(now).toISOString(),
        done: false,
        checks: [],
      },
    };
    this.run = run;
    const checks: [string, string, () => Promise<Omit<Check, "id" | "title">>][] = [
      ["versions", "Versions match", async () => this.versions(options.client)],
      ["settings", "Settings arrive in the shapes we expect", async () => this.settings()],
      ["database", "Database", () => this.database()],
      ["push", "Push to your screen only", async () => this.push(run)],
      ["jobs", "Job scheduler", () => this.scheduleJob(run)],
      ["channels", "Channels", () => this.channelsCheck(options.testPost)],
      ["members", "Members and presence", () => this.members(userId)],
      [
        "client",
        "What your app sees of Root",
        async () => this.clientCheck(userId, options.client),
      ],
    ];
    for (const [id, title, work] of checks) {
      let result: Omit<Check, "id" | "title">;
      try {
        result = await work();
      } catch (error) {
        this.deps.logger.warn("self-test check failed", { check: id, error: String(error) });
        result = { status: "fail", detail: `It threw: ${String(error)}` };
      }
      if (this.run !== run) return; // a newer run replaced this one
      run.report.checks.push({ id, title, ...result });
    }
    this.deps.logger.info("self-test started", { userId });
  }

  /** The caller's client got the ping. */
  confirmPing(userId: string, nonce: string): void {
    const run = this.run;
    if (!run || run.userId !== userId || run.pingNonce !== nonce) return;
    const ms = this.deps.now() - run.pingSentAt;
    this.update("push", (c) =>
      c.status === "pending"
        ? { ...c, status: "pass", detail: `Arrived and confirmed in ${ms} ms. ${c.detail}` }
        : c,
    );
  }

  /** Root ran a job. Call for every job; only the self-test's own tag counts. Never throws. */
  onJob(job: { tag?: string; jobTime: unknown; missed: boolean }): void {
    try {
      const run = this.run;
      if (!run || job.tag !== run.jobTag) return;
      const at = new Date(job.jobTime as number | string | Date).getTime();
      const late = this.deps.now() - run.jobDueAt;
      const type = job.jobTime instanceof Date ? "Date" : typeof job.jobTime;
      const asFake = type === "number";
      this.update("jobs", (c) =>
        c.status !== "pending"
          ? c
          : {
              ...c,
              status: asFake ? "pass" : "warn",
              detail:
                `Ran ${Math.round(late / 1000)}s after it was due${job.missed ? ", as a missed job" : ""}. ` +
                `jobTime arrived as ${type}` +
                (asFake
                  ? ", as the fake Root host sends it."
                  : ". The fake sends a number: update fake-root/."),
              raw: {
                jobTime: String(job.jobTime),
                jobTimeType: type,
                parsed: Number.isFinite(at) ? new Date(at).toISOString() : null,
                missed: job.missed,
              },
            },
      );
      void this.deps.jobs.cancel(run.jobTag).catch(() => {});
    } catch (error) {
      this.deps.logger.warn("self-test job handling failed", { error: String(error) });
    }
  }

  private update(id: string, change: (c: Check) => Check): void {
    const checks = this.run?.report.checks;
    const i = checks?.findIndex((c) => c.id === id) ?? -1;
    if (checks && i >= 0) checks[i] = change(checks[i]!);
  }

  // ---------------------------------------------------------------- checks

  private versions(client: ClientInfo): Omit<Check, "id" | "title"> {
    const { version, genVersion } = this.deps.build;
    const loaded = this.deps.loadedGenVersion();
    const problems: string[] = [];
    if (loaded !== genVersion)
      problems.push(
        `The server loaded networking ${loaded}, but was built for ${genVersion}. Root may be serving a stale cached copy.`,
      );
    if (client.version && client.version !== version)
      problems.push(`Your app is ${client.version}, the server is ${version}.`);
    if (client.genVersion && client.genVersion !== genVersion)
      problems.push(
        `Your app's networking is ${client.genVersion}, the server's is ${genVersion}.`,
      );
    return {
      status: problems.length ? "fail" : "pass",
      detail: problems.length
        ? problems.join(" ")
        : `Everything is ${version}, networking ${genVersion}.`,
      raw: {
        server: { version, genVersion, loadedGenVersion: loaded },
        client: { version: client.version, genVersion: client.genVersion },
      },
    };
  }

  private settings(): Omit<Check, "id" | "title"> {
    const raw = this.deps.rawSettings() as
      Record<string, Record<string, unknown> | undefined> | undefined;
    const types = this.deps.build.settingTypes ?? {};
    const shapes: Record<string, { type: string; shape: string; expected: string }> = {};
    const different: string[] = [];
    for (const [group, items] of Object.entries(types)) {
      for (const [key, type] of Object.entries(items)) {
        const shape = shapeOf(raw?.[group]?.[key]);
        const expected = FAKE_SETTING_SHAPES[type] ?? "?";
        shapes[`${group}.${key}`] = { type, shape, expected };
        if (shape !== "missing" && shape !== expected)
          different.push(`${group}.${key} (${type}) came as ${shape}`);
      }
    }
    const c = this.deps.config();
    const summary = `Timer ${c.preset.focusMinutes}/${c.preset.breakMinutes}, time zone ${c.timeZone}, boss base ${c.boss.baseHpXp.toLocaleString("en-US")} XP, busy at ${c.busyPosts.threshold}.`;
    return {
      status: different.length ? "warn" : "pass",
      detail: different.length
        ? `${different.join("; ")}. The fake Root host expects other shapes: update fake-root/. Read as: ${summary}`
        : `Every setting Root sent has the shape the fake Root host uses. Read as: ${summary}`,
      raw: { shapes, settings: raw },
    };
  }

  private async database(): Promise<Omit<Check, "id" | "title">> {
    const m = await this.deps.db.migrations();
    const value = randomUUID();
    const read = await this.deps.db.roundTrip(value);
    const ok = read === value && m.pending === 0;
    return {
      status: ok ? "pass" : "fail",
      detail:
        `Migration ${m.current}, ${m.done} done, ${m.pending} waiting. ` +
        (read === value
          ? "A test row was written, read back and deleted."
          : "A test row didn't read back the same."),
      raw: m,
    };
  }

  private push(run: Run): Omit<Check, "id" | "title"> {
    run.pingSentAt = this.deps.now();
    const found = this.deps.ping(run.userId, run.pingNonce);
    const getClient = this.deps.getClientFinds(run.userId)
      ? "clients.getClient now finds you, so the SDK bug may be fixed."
      : "clients.getClient still finds no one (the SDK bug), so pushes keep searching getClients().";
    if (!found)
      return {
        status: "fail",
        detail: `Couldn't find your open app among Root's clients. ${getClient}`,
      };
    return { status: "pending", detail: getClient };
  }

  private async scheduleJob(run: Run): Promise<Omit<Check, "id" | "title">> {
    await this.deps.jobs.cancel(run.jobTag);
    run.jobDueAt = this.deps.now() + JOB_DELAY_MS;
    await this.deps.jobs.schedule(run.jobTag, new Date(run.jobDueAt));
    return {
      status: "pending",
      detail: `A one-time test job is due in ${JOB_DELAY_MS / 1000}s. Root checks about once a minute, so this can take up to 2 minutes.`,
    };
  }

  private async channelsCheck(testPost: boolean): Promise<Omit<Check, "id" | "title">> {
    const channels = await this.deps.channels();
    const voice = channels.filter((c) => c.voice).length;
    const c = this.deps.config();
    const where = c.postChannelId
      ? `Bot posts go to #${c.postChannelName || c.postChannelId}.`
      : "No bot messages channel is set, so posts are off.";
    let posted = "";
    let status: CheckStatus = channels.length > 0 ? "pass" : "warn";
    if (testPost) {
      if (!c.postChannelId) {
        posted = " No test post: pick a bot messages channel first.";
        status = "warn";
      } else {
        await this.deps.post(
          c.postChannelId,
          "🧪 Study Squad self-test: this is only a test post.",
        );
        posted = " Sent a test post there.";
      }
    }
    return {
      status,
      detail: `Sees ${channels.length - voice} text and ${voice} voice channel(s). ${where}${posted}`,
      raw: channels.map((ch) => ({ name: ch.name, voice: ch.voice })),
    };
  }

  private async members(userId: string): Promise<Omit<Check, "id" | "title">> {
    const attached = this.deps.attachedUserIds();
    const [nickname, admin] = await Promise.all([
      this.deps.nickname(userId),
      this.deps.isAdmin(userId),
    ]);
    const you = attached.includes(userId);
    return {
      status: you ? "pass" : "fail",
      detail: `${attached.length} member(s) have the app open${you ? ", you included" : ", but not you"}. You're ${nickname}${admin ? ", an admin" : ", not an admin"}.`,
      raw: { attached: attached.length, admin },
    };
  }

  private clientCheck(userId: string, client: ClientInfo): Omit<Check, "id" | "title"> {
    const same = client.userId === userId;
    return {
      status: same ? "pass" : "fail",
      detail: same
        ? `Your app and the server agree on who you are. Theme: ${String(client.theme)}.`
        : `Your app thinks you're ${client.userId}, the server says ${userId}.`,
      raw: {
        theme: client.theme,
        themeShape: shapeOf(client.theme),
        profileShape: shapeOf(client.profile),
      },
    };
  }
}
