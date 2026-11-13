/**
 * The Discord host end to end: a fake Discord API, the real built server in a
 * worker thread per Discord server, and members talking over WebSockets with
 * the same protobuf bytes the client sends.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type * as HostModule from "../src/host";

const repo = path.join(__dirname, "../..");
// The built host: its workers load dist/worker.js.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createHost } = require("../dist/host.js") as typeof HostModule;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const shared = require(
  require.resolve("@studyroom/gen-shared", { paths: [path.join(repo, "server")] }),
);

const GUILD = "111111111111111111";
const OTHER_GUILD = "999999999999999999";
const OWNER = "200000000000000001";
const ANA = "200000000000000002";
const STRANGER = "200000000000000003";
const POST_CHANNEL = "300000000000000001";
const tokens: Record<string, string> = {
  "owner-token": OWNER,
  "ana-token": ANA,
  "stranger-token": STRANGER,
};

const posts: { channelId: string; body: { content: string; allowed_mentions: unknown } }[] = [];

function fakeDiscord() {
  return http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const p = (req.url ?? "").replace(/^\/api/, "");
      const reply = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
      if (p === "/users/@me") {
        const id = bearer && tokens[bearer];
        return id ? reply(200, { id, username: id }) : reply(401, {});
      }
      if (req.headers.authorization !== "Bot bot-token") return reply(401, {});
      if (p === `/guilds/${GUILD}`)
        return reply(200, { id: GUILD, name: "Study Hall", owner_id: OWNER });
      const member = new RegExp(`^/guilds/${GUILD}/members/(\\d+)$`).exec(p);
      if (member) {
        if (member[1] === OWNER)
          return reply(200, { nick: "Owner", roles: [], user: { id: OWNER, username: "owner" } });
        if (member[1] === ANA)
          return reply(200, {
            roles: [],
            user: { id: ANA, username: "ana", global_name: "Ana", avatar: "abc" },
          });
        return reply(404, { message: "Unknown Member" });
      }
      if (p === `/guilds/${GUILD}/roles`)
        return reply(200, [{ id: GUILD, name: "@everyone", permissions: "0" }]);
      if (p === `/guilds/${GUILD}/channels`)
        return reply(200, [{ id: POST_CHANNEL, name: "study", type: 0 }]);
      if (p === `/channels/${POST_CHANNEL}`)
        return reply(200, { id: POST_CHANNEL, name: "study", type: 0 });
      const post = /^\/channels\/(\d+)\/messages$/.exec(p);
      if (post && req.method === "POST") {
        posts.push({ channelId: post[1]!, body: JSON.parse(raw) });
        return reply(200, { id: String(posts.length) });
      }
      // The bot isn't in any other server.
      reply(404, { message: "Unknown Guild" });
    });
  });
}

/** One open Activity. */
class Member {
  private seq = 0;
  readonly messages: { t: string; [k: string]: unknown }[] = [];
  private constructor(private readonly socket: WebSocket) {
    socket.on("message", (d) => this.messages.push(JSON.parse(String(d))));
  }

  static async open(url: string, hello: unknown) {
    const socket = new WebSocket(url);
    await new Promise((r) => socket.once("open", r));
    const member = new Member(socket);
    socket.send(JSON.stringify(hello));
    const first = await member.next((m) => m.t === "hello" || m.t === "denied");
    return { member, first };
  }

  next(match: (m: { t: string; [k: string]: unknown }) => boolean, timeoutMs = 10_000) {
    return new Promise<{ t: string; [k: string]: unknown }>((resolve, reject) => {
      const started = Date.now();
      const look = () => {
        const i = this.messages.findIndex(match);
        if (i >= 0) return resolve(this.messages.splice(i, 1)[0]!);
        if (Date.now() - started > timeoutMs) return reject(new Error("timed out"));
        setTimeout(look, 20);
      };
      look();
    });
  }

  async call(method: string, request: Uint8Array = new Uint8Array()) {
    const id = ++this.seq;
    this.socket.send(
      JSON.stringify({
        t: "call",
        id,
        path: `/.StudyRoomService/${method}`,
        b: Buffer.from(request).toString("base64"),
      }),
    );
    const reply = await this.next((m) => m.id === id);
    if (reply.t === "err")
      throw Object.assign(new Error(String(reply.message)), { code: reply.code });
    return Buffer.from(String(reply.b), "base64");
  }

  async host(payload: Record<string, unknown>) {
    const id = ++this.seq;
    this.socket.send(JSON.stringify({ ...payload, id }));
    return this.next((m) => m.id === id);
  }

  async profiles(ids: string[]) {
    const id = ++this.seq;
    this.socket.send(JSON.stringify({ t: "profiles", id, ids }));
    return (await this.next((m) => m.id === id)).profiles;
  }

  close() {
    this.socket.close();
  }
}

describe("Discord host", () => {
  const discord = fakeDiscord();
  let host: ReturnType<typeof createHost>;
  let url = "";
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "discord-host-"));
  const open: Member[] = [];
  const sign = async (accessToken: string, guildId = GUILD) => {
    const result = await Member.open(url, { t: "auth", accessToken, guildId });
    open.push(result.member);
    return result;
  };

  beforeAll(async () => {
    await new Promise<void>((r) => discord.listen(0, "127.0.0.1", r));
    const apiPort = (discord.address() as { port: number }).port;
    host = createHost({
      clientId: "client",
      clientSecret: "secret",
      botToken: "bot-token",
      apiBase: `http://127.0.0.1:${apiPort}/api`,
      dataDir,
      serverMain: path.join(repo, "server/dist/main.js"),
      manifestPath: path.join(repo, "root-manifest.json"),
    });
    const address = (await host.listen(0, "127.0.0.1")) as { port: number };
    url = `ws://127.0.0.1:${address.port}/ws`;
  });

  afterAll(async () => {
    for (const m of open) m.close();
    await host.close();
    discord.close();
  });

  it("signs a member in with their Discord token and answers requests", async () => {
    const { member, first } = await sign("owner-token");
    expect(first).toMatchObject({ t: "hello", userId: OWNER, guildId: GUILD });
    const snapshot = shared.RoomSnapshot.fromBinary(await member.call("GetRoom"));
    expect(snapshot.me.userId).toBe(OWNER);
  });

  it("turns away bad tokens, non-members, servers without the bot, and dev logins", async () => {
    expect((await sign("nope")).first).toMatchObject({
      t: "denied",
      message: expect.stringMatching(/expired/),
    });
    expect((await sign("stranger-token")).first).toMatchObject({
      t: "denied",
      message: expect.stringMatching(/member/),
    });
    expect((await sign("ana-token", OTHER_GUILD)).first).toMatchObject({
      t: "denied",
      message: expect.stringMatching(/bot/),
    });
    const dev = await Member.open(url, { t: "auth", dev: { userId: ANA, guildId: GUILD } });
    open.push(dev.member);
    expect(dev.first).toMatchObject({ t: "denied" });
  });

  it("pushes room updates to everyone in the same server", async () => {
    const { member: owner } = await sign("owner-token");
    const { member: ana } = await sign("ana-token");
    await ana.call("GetRoom");
    await owner.call(
      "JoinRoomTimer",
      shared.JoinRoomTimerRequest.toBinary({ goals: ["Read"], goalsPrivate: false }),
    );
    const push = await ana.next(
      (m) => m.t === "push" && m.path === "/.StudyRoomService/BroadcastRoomUpdated",
    );
    const room = shared.RoomUpdatedEvent.fromBinary(Buffer.from(String(push.b), "base64")).room;
    expect(JSON.stringify(room)).toContain(OWNER);
  });

  it("gives names and avatars from Discord", async () => {
    const { member } = await sign("ana-token");
    expect(await member.profiles([ANA, STRANGER])).toEqual([
      {
        id: ANA,
        nickname: "Ana",
        profilePictureUri: `https://cdn.discordapp.com/avatars/${ANA}/abc.png`,
      },
      { id: STRANGER, nickname: "Former member", profilePictureUri: "" },
    ]);
  });

  it("lets the owner manage settings, and posts in the picked channel with Discord mentions", async () => {
    await host.guilds.saveSettings(GUILD, { room: { postChannel: POST_CHANNEL } });
    const { member } = await sign("owner-token");
    const startsAtMs = Date.now() + 2 * 60 * 60 * 1000;
    await member.call(
      "ScheduleSession",
      shared.ScheduleSessionRequest.toBinary({ title: "Exam prep", startsAtMs }),
    );
    await expect.poll(() => posts.length).toBeGreaterThan(0);
    expect(posts.at(-1)).toMatchObject({
      channelId: POST_CHANNEL,
      body: { content: expect.stringContaining("Exam prep"), allowed_mentions: { parse: [] } },
    });
    // The reminder is a job saved in the server's own folder.
    const jobs = JSON.parse(fs.readFileSync(path.join(dataDir, GUILD, "jobs.json"), "utf8"));
    expect(jobs).toContainEqual(expect.objectContaining({ start: startsAtMs }));
  });

  it("shows and saves server settings only for people who can manage the server", async () => {
    const { member: ana } = await sign("ana-token");
    expect(await ana.host({ t: "settings" })).toMatchObject({ t: "ok", canEdit: false });
    expect(
      await ana.host({ t: "settings-save", values: { game: { bossEnabled: false } } }),
    ).toMatchObject({
      t: "err",
      message: expect.stringMatching(/Manage Server/),
    });

    const { member: owner } = await sign("owner-token");
    expect(await owner.host({ t: "settings" })).toMatchObject({
      canEdit: true,
      channels: [{ id: POST_CHANNEL, name: "study" }],
    });
    expect(await owner.host({ t: "settings-save", values: "nope" })).toMatchObject({ t: "err" });
    const saved = await owner.host({
      t: "settings-save",
      values: { room: { postChannel: POST_CHANNEL }, game: { bossEnabled: false } },
    });
    expect(saved).toMatchObject({
      t: "ok",
      canEdit: true,
      values: { game: { bossEnabled: false } },
    });
    // The server picks it up live and tells everyone.
    const push = await ana.next(
      (m) => m.t === "push" && m.path === "/.StudyRoomService/BroadcastRoomUpdated",
    );
    const room = shared.RoomUpdatedEvent.fromBinary(Buffer.from(String(push.b), "base64")).room;
    expect(room.features.bossEnabled).toBe(false);
  });

  it("keeps each server's data in its own folder", () => {
    expect(fs.readdirSync(path.join(dataDir, GUILD)).sort()).toEqual(
      expect.arrayContaining(["jobs.json", "settings.json", "study-squad.sqlite3"]),
    );
  });
});

describe("Discord host: sleeping servers", () => {
  const discord = fakeDiscord();
  let host: ReturnType<typeof createHost>;
  let url = "";
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "discord-sleep-"));

  beforeAll(async () => {
    await new Promise<void>((r) => discord.listen(0, "127.0.0.1", r));
    const apiPort = (discord.address() as { port: number }).port;
    host = createHost({
      clientId: "client",
      clientSecret: "secret",
      botToken: "bot-token",
      apiBase: `http://127.0.0.1:${apiPort}/api`,
      dataDir,
      serverMain: path.join(repo, "server/dist/main.js"),
      manifestPath: path.join(repo, "root-manifest.json"),
      // Longer than the server's 1 s room push bundling, so the room it reports is current.
      idleMs: 1500,
      jobPollMs: 100,
    });
    const address = (await host.listen(0, "127.0.0.1")) as { port: number };
    url = `ws://127.0.0.1:${address.port}/ws`;
  });

  afterAll(async () => {
    await host.close();
    discord.close();
  });

  it("sleeps once everyone has left and nobody is on a timer, and wakes when someone opens it", async () => {
    const { member } = await Member.open(url, {
      t: "auth",
      accessToken: "ana-token",
      guildId: GUILD,
    });
    await member.call("GetRoom");
    member.close();
    await expect.poll(() => host.guilds.isRunning(GUILD), { timeout: 5000 }).toBe(false);

    const again = await Member.open(url, { t: "auth", accessToken: "ana-token", guildId: GUILD });
    expect(again.first).toMatchObject({ t: "hello" });
    expect(shared.RoomSnapshot.fromBinary(await again.member.call("GetRoom")).me.userId).toBe(ANA);
    again.member.close();
    await expect.poll(() => host.guilds.isRunning(GUILD), { timeout: 5000 }).toBe(false);
  });

  it("stays awake while someone is on a timer, even with the Activity closed", async () => {
    const { member } = await Member.open(url, {
      t: "auth",
      accessToken: "owner-token",
      guildId: GUILD,
    });
    await member.call(
      "JoinRoomTimer",
      shared.JoinRoomTimerRequest.toBinary({ goals: [], goalsPrivate: true }),
    );
    member.close();
    await new Promise((r) => setTimeout(r, 3500));
    expect(host.guilds.isRunning(GUILD)).toBe(true);

    // Leaving the timer lets it sleep.
    const back = await Member.open(url, { t: "auth", accessToken: "owner-token", guildId: GUILD });
    await back.member.call("LeaveRoomTimer");
    back.member.close();
    await expect.poll(() => host.guilds.isRunning(GUILD), { timeout: 5000 }).toBe(false);
  });

  it("wakes a sleeping server when one of its jobs comes due", async () => {
    expect(host.guilds.isRunning(GUILD)).toBe(false);
    const jobsFile = path.join(dataDir, GUILD, "jobs.json");
    fs.writeFileSync(
      jobsFile,
      JSON.stringify([{ id: 99, tag: "probe", resourceId: "probe", start: Date.now() }]),
    );
    await expect.poll(() => host.guilds.isRunning(GUILD), { timeout: 5000 }).toBe(true);
    // Its worker fired the job, so it's gone from the file.
    await expect
      .poll(() => JSON.parse(fs.readFileSync(jobsFile, "utf8")), { timeout: 5000 })
      .toEqual([]);
  });
});
