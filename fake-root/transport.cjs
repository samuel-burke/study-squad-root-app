// Preload after register.cjs to let browsers reach the fake Root host, like
// Root's servers relay between the app's client and server:
//
//   node --require fake-root/register.cjs --require fake-root/transport.cjs server/dist/main.js
//
// One HTTP port (FAKE_ROOT_PORT, default 4174) serves:
//   /            the client build in FAKE_ROOT_STATIC (built with `vite build --mode fakeroot`)
//   /root        a WebSocket per open app, carrying protobuf bytes (see client-app.js)
//   /__fake/...  test controls: settings, jobs, posts, voice, state
//
// Open the app as a member with /?user=<userId>. Each tab is its own device.
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { WebSocketServer } = require("ws");
const { __fake: fake } = require("./server-app.cjs");

const port = Number(process.env.FAKE_ROOT_PORT ?? 4174);
const staticDir = process.env.FAKE_ROOT_STATIC ? path.resolve(process.env.FAKE_ROOT_STATIC) : null;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".map": "application/json",
};

function serveStatic(req, res) {
  if (!staticDir) return send(res, 404, { error: "no FAKE_ROOT_STATIC" });
  const url = new URL(req.url, "http://x");
  let file = path.join(staticDir, path.normalize(decodeURIComponent(url.pathname)));
  if (!file.startsWith(staticDir)) return send(res, 403, { error: "outside static dir" });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory())
    file = path.join(staticDir, "index.html");
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? String(v) : v)));
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const controls = {
  "GET /__fake/state": () => ({
    attached: fake.attachedUsers(),
    jobs: fake.jobs,
    posts: fake.posts.length,
    broadcasts: fake.sent.length,
  }),
  "GET /__fake/posts": () => fake.posts,
  "POST /__fake/settings": (body) => (fake.updateSettings(body), { ok: true }),
  "POST /__fake/jobs/run": (body) => (fake.runDueJobs(body.now ?? Date.now()), { jobs: fake.jobs }),
  "POST /__fake/clock/advance": async (body) => {
    const now = fake.advanceClock(Number(body.ms));
    // Any request makes the engine settle everything due up to now, the way a
    // member opening the app would, and push what changed to everyone.
    await fake.call(
      "/.StudyRoomService/GetRoom",
      new Uint8Array(),
      fake.config.ownerUserId,
      "d-clock",
    );
    return { now };
  },
  "POST /__fake/voice/join": (body) => (fake.joinVoice(body.channelId, body.userId), { ok: true }),
  "POST /__fake/voice/leave": (body) => (
    fake.leaveVoice(body.channelId, body.userId),
    { ok: true }
  ),
};

async function handle(req, res) {
  const route = `${req.method} ${new URL(req.url, "http://x").pathname}`;
  const control = controls[route];
  if (control) {
    try {
      return send(res, 200, await control(await readBody(req)));
    } catch (error) {
      // The stack goes to the server log, not over HTTP.
      console.error(
        JSON.stringify({
          level: "error",
          message: "fake-root: control failed",
          route,
          error: String(error?.stack ?? error),
        }),
      );
      return send(res, 500, { error: "control failed, see the server log" });
    }
  }
  if (req.method === "GET") return serveStatic(req, res);
  send(res, 404, { error: route });
}

let deviceSeq = 0;

function onSocket(socket, req) {
  const url = new URL(req.url, "http://x");
  const userId = url.searchParams.get("user");
  if (!userId || !fake.nickname(userId)) {
    socket.close(4003, `not a member: ${userId}`);
    return;
  }
  const deviceId = `d${++deviceSeq}`;
  const push = (methodPath, bytes) =>
    socket.send(
      JSON.stringify({ t: "push", path: methodPath, b: Buffer.from(bytes).toString("base64") }),
    );

  socket.on("message", async (data) => {
    const msg = JSON.parse(String(data));
    if (msg.t === "call") {
      try {
        const bytes = await fake.call(msg.path, Buffer.from(msg.b, "base64"), userId, deviceId);
        socket.send(
          JSON.stringify({ t: "ok", id: msg.id, b: Buffer.from(bytes).toString("base64") }),
        );
      } catch (error) {
        // Root hands the client { code, message } for a RootServerException.
        const code = typeof error?.code === "number" ? error.code : 0;
        const message = code > 0 ? String(error.message) : "internal error";
        if (code === 0)
          console.error(
            JSON.stringify({
              level: "error",
              message: "fake-root: call failed",
              path: msg.path,
              error: String(error?.stack ?? error),
            }),
          );
        socket.send(JSON.stringify({ t: "err", id: msg.id, code, message }));
      }
    } else if (msg.t === "profiles") {
      const profiles = msg.ids.map((id) => ({
        id,
        nickname: fake.nickname(id) ?? "Unknown",
        onlineStatus: 1,
      }));
      socket.send(JSON.stringify({ t: "ok", id: msg.id, profiles }));
    }
  });
  socket.on("close", () => fake.detach(userId, deviceId));
  fake.attach(userId, deviceId, push);
  socket.send(JSON.stringify({ t: "hello", userId, deviceId }));
}

const previous = fake.onStarted;
fake.onStarted = async () => {
  await previous?.();
  const server = http.createServer((req, res) => void handle(req, res));
  const wss = new WebSocketServer({ server, path: "/root" });
  wss.on("connection", onSocket);
  await new Promise((resolve) => server.listen(port, resolve));
  console.log(
    JSON.stringify({
      level: "info",
      message: "fake-root: listening",
      url: `http://localhost:${port}`,
    }),
  );
};
