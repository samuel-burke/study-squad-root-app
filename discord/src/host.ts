import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { DiscordApi, DiscordError, memberName, type DiscordMember } from "./discordApi";
import { rootPermissions } from "./community";
import { CallError, Guilds, type GuildsOptions } from "./guilds";
import { readPlainSettings, type PlainSettings } from "./rootSettings";

export interface HostOptions extends GuildsOptions {
  clientId: string;
  clientSecret: string;
  /** The Activity's built client (vite build --mode discord), served from "/". */
  staticDir?: string;
  /** Local testing only: sign in as any user id without Discord. */
  devLogin?: boolean;
  fetch?: typeof fetch;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

const MEMBER_TTL_MS = 5 * 60 * 1000;

/** What a socket sends first: who it is and which Discord server it opened in. */
type Hello =
  | { t: "auth"; accessToken: string; guildId: string }
  | { t: "auth"; dev: { userId: string; guildId: string } };

type Message =
  | { t: "call"; id: number; path: string; b: string }
  | { t: "profiles"; id: number; ids: string[] }
  | { t: "settings"; id: number }
  | { t: "settings-save"; id: number; values: PlainSettings };

/**
 * The Discord Activity's server: serves the client, swaps sign-in codes for
 * tokens, and carries each open Activity's requests to its Discord server's
 * Study Squad over one WebSocket.
 */
export function createHost(options: HostOptions) {
  const api = new DiscordApi({
    botToken: options.botToken,
    base: options.apiBase,
    fetch: options.fetch,
  });
  const guilds = new Guilds(options);
  const members = new Map<string, { member: DiscordMember; at: number }>();

  async function member(guildId: string, userId: string) {
    const key = `${guildId}/${userId}`;
    const hit = members.get(key);
    if (hit && Date.now() - hit.at < MEMBER_TTL_MS) return hit.member;
    const fresh = await api.member(guildId, userId);
    members.set(key, { member: fresh, at: Date.now() });
    return fresh;
  }

  /** Checks the token with Discord, and that the bot and the member are both in the server. */
  async function signIn(hello: Hello): Promise<{ userId: string; guildId: string }> {
    if ("dev" in hello) {
      if (!options.devLogin) throw new CallError(16, "Sign in through Discord.");
      return hello.dev;
    }
    const user = await api.me(hello.accessToken).catch(() => {
      throw new CallError(16, "Discord sign-in expired. Reopen Study Squad.");
    });
    await api.guild(hello.guildId).catch(() => {
      throw new CallError(9, "Ask a server admin to add the Study Squad bot to this server first.");
    });
    await member(hello.guildId, user.id).catch(() => {
      throw new CallError(7, "Study Squad only works in a server you're a member of.");
    });
    return { userId: user.id, guildId: hello.guildId };
  }

  /** The server owner, or a role with Administrator or Manage Server. Checked fresh each time. */
  async function canManage(guildId: string, userId: string) {
    const [guild, me, roles] = await Promise.all([
      api.guild(guildId),
      api.member(guildId, userId),
      api.roles(guildId),
    ]);
    if (guild.owner_id === userId) return true;
    const mine = new Set([...me.roles, guildId]);
    return roles.some((role) => {
      if (!mine.has(role.id)) return false;
      const p = rootPermissions(role.permissions);
      return p.communityFullControl || p.communityManageApps;
    });
  }

  /** Server settings for the in-app sheet: admins only. */
  async function settings(guildId: string, userId: string) {
    if (!(await canManage(guildId, userId))) return { canEdit: false };
    const channels = (await api.channels(guildId))
      .filter((c) => c.type === 0)
      .map((c) => ({ id: c.id, name: c.name ?? "" }));
    const values = readPlainSettings(path.join(options.dataDir, guildId, "settings.json"));
    return { canEdit: true, values, channels };
  }

  async function saveSettings(guildId: string, userId: string, values: unknown) {
    if (!(await canManage(guildId, userId)))
      throw new CallError(7, "Only people with Manage Server can change these.");
    if (!isPlainSettings(values)) throw new CallError(3, "Those settings don't look right.");
    await guilds.saveSettings(guildId, values);
    return settings(guildId, userId);
  }

  async function profiles(guildId: string, ids: string[]) {
    const found = await Promise.all(
      ids.map(async (id) => {
        try {
          const m = await member(guildId, id);
          const avatar = m.avatar
            ? `https://cdn.discordapp.com/guilds/${guildId}/users/${id}/avatars/${m.avatar}.png`
            : m.user?.avatar
              ? `https://cdn.discordapp.com/avatars/${id}/${m.user.avatar}.png`
              : "";
          return { id, nickname: memberName(m), profilePictureUri: avatar };
        } catch {
          // Left the server: the client shows its fallback.
          return { id, nickname: "Former member", profilePictureUri: "" };
        }
      }),
    );
    return found;
  }

  function onSocket(socket: WebSocket) {
    const deviceId = randomUUID();
    let session: { userId: string; guildId: string } | null = null;
    const reply = (body: Record<string, unknown>) => socket.send(JSON.stringify(body));
    const fail = (id: number, error: unknown) => {
      if (error instanceof CallError)
        return reply({ t: "err", id, code: error.code, message: error.message });
      console.error(
        JSON.stringify({ level: "error", message: "socket request failed", error: String(error) }),
      );
      reply({ t: "err", id, code: 0, message: "" });
    };

    socket.on("message", async (data) => {
      let message: Hello | Message;
      try {
        message = JSON.parse(String(data)) as Hello | Message;
      } catch {
        return socket.close(1003, "bad message");
      }
      if (!session) {
        if (message.t !== "auth") return socket.close(4001, "sign in first");
        try {
          session = await signIn(message);
          const { userId, guildId } = session;
          await guilds.attach(guildId, userId, deviceId, (methodPath, bytes) =>
            reply({ t: "push", path: methodPath, b: Buffer.from(bytes).toString("base64") }),
          );
          reply({ t: "hello", userId, guildId });
        } catch (error) {
          const text =
            error instanceof CallError
              ? error.message
              : "Study Squad couldn't start. Try again soon.";
          if (!(error instanceof CallError))
            console.error(
              JSON.stringify({ level: "error", message: "sign-in failed", error: String(error) }),
            );
          reply({ t: "denied", message: text });
          socket.close(4003, "denied");
        }
        return;
      }
      const { userId, guildId } = session;
      try {
        if (message.t === "call") {
          const bytes = await guilds.call(
            guildId,
            message.path,
            Buffer.from(message.b, "base64"),
            userId,
            deviceId,
          );
          reply({ t: "ok", id: message.id, b: Buffer.from(bytes).toString("base64") });
        } else if (message.t === "profiles") {
          reply({
            t: "ok",
            id: message.id,
            profiles: await profiles(guildId, message.ids.slice(0, 100)),
          });
        } else if (message.t === "settings") {
          reply({ t: "ok", id: message.id, ...(await settings(guildId, userId)) });
        } else if (message.t === "settings-save") {
          const saved = await saveSettings(guildId, userId, message.values);
          reply({ t: "ok", id: message.id, ...saved });
        }
      } catch (error) {
        fail((message as Message).id, error);
      }
    });
    socket.on("close", () => {
      if (session) guilds.detach(session.guildId, session.userId, deviceId);
    });
  }

  async function exchange(req: http.IncomingMessage, res: http.ServerResponse) {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 10_000) return send(res, 413, { error: "too large" });
    }
    try {
      const { code } = JSON.parse(raw) as { code?: unknown };
      if (typeof code !== "string" || !code) return send(res, 400, { error: "missing code" });
      const accessToken = await api.exchangeCode(code, options.clientId, options.clientSecret);
      send(res, 200, { access_token: accessToken });
    } catch (error) {
      send(res, error instanceof DiscordError ? 401 : 400, { error: "sign-in failed" });
    }
  }

  function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
    const dir = options.staticDir ? path.resolve(options.staticDir) : null;
    if (!dir) return send(res, 404, { error: "no client build" });
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    let file = path.join(dir, path.normalize(pathname));
    if (!file.startsWith(dir)) return send(res, 403, { error: "forbidden" });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory())
      file = path.join(dir, "index.html");
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer((req, res) => {
    const route = `${req.method} ${new URL(req.url ?? "/", "http://x").pathname}`;
    if (route === "POST /api/token") return void exchange(req, res);
    if (route === "GET /healthz") return send(res, 200, { ok: true });
    if (req.method === "GET") return serveStatic(req, res);
    send(res, 404, { error: "not found" });
  });
  const sockets = new WebSocketServer({ server, path: "/ws", maxPayload: 1024 * 1024 });
  sockets.on("connection", onSocket);

  return {
    server,
    guilds,
    async listen(port: number, hostname = "0.0.0.0") {
      await guilds.startKnown();
      await new Promise<void>((resolve) => server.listen(port, hostname, resolve));
      return server.address();
    },
    async close() {
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await guilds.stopAll();
    },
  };
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Groups of plain values; the server reads them through the manifest and ignores the rest. */
function isPlainSettings(value: unknown): value is PlainSettings {
  const isObject = (v: unknown) => typeof v === "object" && v !== null && !Array.isArray(v);
  return isObject(value) && Object.values(value as object).every(isObject);
}
