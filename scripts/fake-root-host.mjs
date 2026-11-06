// Runs the real server (server/dist/main.js) on the fake Root host, serving the
// `fakeroot` client build, for the full-stack e2e tests and for poking at by
// hand. Each run starts on a fresh database.
//
//   npm run build && npm run build:fakeroot -w @studyroom/client
//   node scripts/fake-root-host.mjs            # http://127.0.0.1:4174/?user=u-ana
//
// FAKE_ROOT_PORT changes the port. Members are u-owner, u-ana, u-ben, u-cy.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "fake-root-"));
const configFile = path.join(work, "fake-root.json");
fs.writeFileSync(
  configFile,
  JSON.stringify({
    dbFile: path.join(work, "app.sqlite3"),
    manifest: path.join(repo, "root-manifest.json"),
    settings: { room: { postChannel: "ch-study" } },
  }),
);

const child = spawn(
  process.execPath,
  [
    "--require",
    path.join(repo, "fake-root/register.cjs"),
    "--require",
    path.join(repo, "fake-root/transport.cjs"),
    path.join(repo, "server/dist/main.js"),
  ],
  {
    cwd: path.join(repo, "server"),
    env: {
      ...process.env,
      FAKE_ROOT_CONFIG: configFile,
      FAKE_ROOT_STATIC: path.join(repo, "client/dist-fakeroot"),
    },
    stdio: "inherit",
  },
);

const stop = (signal) => child.kill(signal);
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("exit", (code) => {
  fs.rmSync(work, { recursive: true, force: true });
  process.exit(code ?? 0);
});
