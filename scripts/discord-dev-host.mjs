// Runs the Discord host (discord/dist) against a fake Discord API, serving the
// `discord` client build, for the Discord e2e tests and for trying the Activity
// without Discord. Each run starts on fresh data.
//
//   npm run build && VITE_DISCORD_CLIENT_ID=0 npm run build:discord -w @studyroom/client
//   node scripts/discord-dev-host.mjs
//   open http://127.0.0.1:8090/?devUser=200000000000000002&devGuild=111111111111111111
//
// Members: ...001 Samuel (server owner), ...002 Ana, ...003 Ben.
// DISCORD_DEV_PORT changes the port. Channel posts are logged to stdout.
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createHost } = createRequire(import.meta.url)(path.join(repo, "discord/dist/host.js"));

const GUILD = "111111111111111111";
const OWNER = "200000000000000001";
const members = { [OWNER]: "Samuel", "200000000000000002": "Ana", "200000000000000003": "Ben" };

const discord = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const p = (req.url ?? "").replace(/^\/api/, "");
    const reply = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (p === `/guilds/${GUILD}`)
      return reply(200, { id: GUILD, name: "Study Hall", owner_id: OWNER });
    const member = /\/members\/(\d+)$/.exec(p);
    if (member) {
      const name = members[member[1]];
      return name
        ? reply(200, { nick: name, roles: [], user: { id: member[1], username: name } })
        : reply(404, {});
    }
    if (p.endsWith("/roles"))
      return reply(200, [{ id: GUILD, name: "@everyone", permissions: "0" }]);
    if (p.endsWith("/channels"))
      return reply(200, [{ id: "300000000000000001", name: "study", type: 0 }]);
    if (/^\/channels\/\d+$/.test(p))
      return reply(200, { id: p.split("/")[2], name: "study", type: 0 });
    if (req.method === "POST") {
      console.log(
        JSON.stringify({ level: "info", message: "fake discord: post", body: JSON.parse(raw) }),
      );
      return reply(200, { id: "1" });
    }
    reply(404, { message: "Unknown" });
  });
});

await new Promise((resolve) => discord.listen(0, "127.0.0.1", resolve));
const host = createHost({
  clientId: "0",
  clientSecret: "dev",
  botToken: "dev",
  devLogin: true,
  apiBase: `http://127.0.0.1:${discord.address().port}/api`,
  dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "discord-dev-")),
  serverMain: path.join(repo, "server/dist/main.js"),
  manifestPath: path.join(repo, "root-manifest.json"),
  staticDir: path.join(repo, "client/dist-discord"),
});
const port = Number(process.env.DISCORD_DEV_PORT ?? 8090);
await host.listen(port, "127.0.0.1");
console.log(
  JSON.stringify({
    level: "info",
    message: "discord dev host listening",
    url: `http://127.0.0.1:${port}`,
  }),
);
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => void host.close().finally(() => process.exit(0)));
}
