import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { discordCommunity, rootPermissions, toDiscordMentions } from "../src/community";
import { rateLimiter } from "../src/host";
import { DiscordApi, memberName } from "../src/discordApi";
import { JOB_EVENT, JobScheduler } from "../src/jobs";
import { readManifest, toRootSettings } from "../src/rootSettings";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("toDiscordMentions", () => {
  it("rewrites Root mentions and lists who they ping", () => {
    const out = toDiscordMentions(
      "Starting now: [@Ana](root://user/123456789012) and [@Ben](root://user/223456789012), [@Ana](root://user/123456789012)",
    );
    expect(out.content).toBe("Starting now: <@123456789012> and <@223456789012>, <@123456789012>");
    expect(out.userIds).toEqual(["123456789012", "223456789012"]);
  });

  it("leaves everything else alone, @everyone included (Discord is told not to ping it)", () => {
    expect(toDiscordMentions("@everyone [link](https://x.y)")).toEqual({
      content: "@everyone [link](https://x.y)",
      userIds: [],
    });
  });
});

describe("rootPermissions", () => {
  it("maps Administrator to full control and Manage Server to manage apps", () => {
    expect(rootPermissions(String(1 << 3))).toEqual({
      communityFullControl: true,
      communityManageCommunity: false,
      communityManageApps: false,
    });
    expect(rootPermissions(String(1 << 5))).toMatchObject({ communityManageApps: true });
    expect(rootPermissions("0")).toMatchObject({
      communityManageApps: false,
      communityFullControl: false,
    });
    // Permission bitfields go past 2^53.
    expect(rootPermissions(String((1n << 50n) | 8n)).communityFullControl).toBe(true);
  });
});

describe("memberName", () => {
  it("prefers the server nickname, then display name, then username", () => {
    expect(
      memberName({ nick: "Nick", roles: [], user: { id: "1", username: "u", global_name: "G" } }),
    ).toBe("Nick");
    expect(memberName({ roles: [], user: { id: "1", username: "u", global_name: "G" } })).toBe("G");
    expect(memberName({ roles: [], user: { id: "1", username: "u" } })).toBe("u");
  });
});

describe("discordCommunity", () => {
  it("lists text and voice channels in Root's shapes", async () => {
    const fetch = vi.fn(async () =>
      json(200, [
        { id: "1", name: "general", type: 0 },
        { id: "2", name: "Study", type: 2 },
        { id: "3", name: "Stage", type: 13 },
        { id: "4", name: "Category", type: 4 },
      ]),
    );
    const community = discordCommunity(
      "99999",
      new DiscordApi({ botToken: "t", base: "http://d", fetch }),
    );
    const [group] = await community.channelGroups.list();
    const channels = await community.channels.list({ channelGroupId: group!.id });
    expect(channels.map((c) => [c.name, c.channelType])).toEqual([
      ["general", 1],
      ["Study", 4],
      ["Stage", 4],
    ]);
  });

  it("posts with Discord mentions and pings only those members", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      json(200, { id: "m1" }),
    );
    const community = discordCommunity(
      "99999",
      new DiscordApi({ botToken: "t", base: "http://d", fetch }),
    );
    await community.channelMessages.create({
      channelId: "5",
      content: "Hi [@Ana](root://user/123456789012)",
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://d/channels/5/messages");
    expect(JSON.parse(String(init!.body))).toEqual({
      content: "Hi <@123456789012>",
      allowed_mentions: { parse: [], users: ["123456789012"] },
    });
    expect((init!.headers as Record<string, string>).authorization).toBe("Bot t");
  });

  it("links channels to discord.com", async () => {
    const community = discordCommunity("99999", new DiscordApi({ botToken: "t" }));
    expect(await community.communityLinks.communityChannelCreate({ channelId: "5" })).toEqual({
      url: "https://discord.com/channels/99999/5",
    });
  });
});

describe("DiscordApi", () => {
  it("waits and retries once when rate limited", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(429, { retry_after: 0.5 }))
      .mockResolvedValueOnce(json(200, { id: "1", name: "g", owner_id: "2" }));
    const api = new DiscordApi({ botToken: "t", base: "http://d", fetch });
    const result = api.guild("1");
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toMatchObject({ owner_id: "2" });
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("throws on errors without the token in the message", async () => {
    const api = new DiscordApi({
      botToken: "secret",
      base: "http://d",
      fetch: async () => json(403, {}),
    });
    await expect(api.member("1", "2")).rejects.toThrow(/Discord 403/);
    await expect(api.member("1", "2")).rejects.not.toThrow(/secret/);
  });
});

describe("toRootSettings", () => {
  const manifest = readManifest(path.join(__dirname, "../../root-manifest.json"));

  it("fills manifest defaults and wraps numbers like Root", () => {
    const delivered = toRootSettings({}, manifest);
    expect(delivered.room!.busyThreshold).toEqual({ value: expect.any(Number) });
    expect(delivered.room!.postChannel).toBeUndefined();
  });

  it("delivers a picked channel as a list", () => {
    expect(toRootSettings({ room: { postChannel: "5" } }, manifest).room!.postChannel).toEqual([
      "5",
    ]);
  });
});

describe("JobScheduler", () => {
  const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jobs-")), "jobs.json");

  it("fires due jobs once with jobTime in epoch ms, and keeps the rest across restarts", async () => {
    const f = file();
    let now = 1000;
    const jobs = new JobScheduler(f, () => now);
    await jobs.create({ resourceId: "a", tag: "a", start: new Date(2000), jobInterval: 1 });
    await jobs.create({ resourceId: "b", tag: "b", start: 5000, jobInterval: 1 });
    const fired: string[] = [];
    jobs.on(JOB_EVENT.Job, (job: { tag: string; jobTime: number }) =>
      fired.push(`${job.tag}@${job.jobTime}`),
    );
    jobs.runDue(); // nothing is due yet
    now = 2500;
    jobs.runDue();
    jobs.runDue();
    expect(fired).toEqual(["a@2000"]);

    // Restarted well after "b" came due: it fires as missed.
    now = 5000 + 3 * 60_000;
    const restarted = new JobScheduler(f, () => now);
    const missed: string[] = [];
    restarted.on(JOB_EVENT.JobMissed, (job: { tag: string }) => missed.push(job.tag));
    restarted.runDue();
    expect(missed).toEqual(["b"]);
  });

  it("deletes by tag and refuses repeating jobs", async () => {
    const jobs = new JobScheduler(file(), () => 0);
    await jobs.create({ resourceId: "a", tag: "a", start: 10, jobInterval: 1 });
    await jobs.deleteByTag("a");
    const fired = vi.fn();
    jobs.on(JOB_EVENT.JobMissed, fired);
    jobs.runDue();
    expect(fired).not.toHaveBeenCalled();
    await expect(
      jobs.create({ resourceId: "x", tag: "x", start: 1, jobInterval: 2 }),
    ).rejects.toThrow();
  });
});

describe("rateLimiter", () => {
  it("allows a burst, then refills over time", () => {
    let now = 0;
    const allow = rateLimiter(3, 1, () => now);
    expect([allow(), allow(), allow(), allow()]).toEqual([true, true, true, false]);
    now = 1000;
    expect([allow(), allow()]).toEqual([true, false]);
  });
});

describe("channel posts", () => {
  it("go out one at a time per channel, in order, even if one fails", async () => {
    const order: string[] = [];
    let release: () => void = () => {};
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const { content } = JSON.parse(String(init!.body)) as { content: string };
      order.push(`start ${content}`);
      if (content === "first") await new Promise<void>((r) => (release = r));
      order.push(`end ${content}`);
      return content === "second" ? json(500, {}) : json(200, { id: content });
    });
    const community = discordCommunity(
      "99999",
      new DiscordApi({ botToken: "t", base: "http://d", fetch }),
    );
    const posts = ["first", "second", "third"].map((content) =>
      community.channelMessages.create({ channelId: "5", content }),
    );
    await vi.waitFor(() => expect(order).toEqual(["start first"]));
    release();
    const results = await Promise.allSettled(posts);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
    expect(order).toEqual([
      "start first",
      "end first",
      "start second",
      "end second",
      "start third",
      "end third",
    ]);
  });
});
