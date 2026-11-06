// Checks a built Root package (rootapp.pkg) the way Root will see it, before it
// is uploaded:
//
//   1. The package's manifest has the repo's version.
//   2. The client bundle is in it.
//   3. Every copy of the generated networking code in it carries the version of
//      the current .proto files. A stale copy once crashed 0.3.0 and 0.3.1 on Root.
//   4. The packaged server starts, from the package's own files and
//      node_modules, against the fake Root host (fake-root/), and answers
//      read-only RPCs in protobuf. Then it starts a second time on the same
//      database, like a Root restart.
//
// Usage: node scripts/package-smoke.mjs [path/to/rootapp.pkg]
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { protoVersion } from "./proto-version.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = path.resolve(process.argv[2] ?? "rootapp.pkg");
const BOOT_TIMEOUT_MS = 30_000;

const failures = [];
const pass = (what) => console.log(`  ok   ${what}`);
const fail = (what) => {
  failures.push(what);
  console.log(`  FAIL ${what}`);
};
const check = (ok, what) => (ok ? pass(what) : fail(what));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

if (!fs.existsSync(pkg)) {
  console.error(`No package at ${pkg}. Build one with:
  npx rootsdk build package --output-file ./rootapp.pkg --project-folder .`);
  process.exit(2);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "package-smoke-"));
const untar = (file, into) => {
  fs.mkdirSync(into, { recursive: true });
  execFileSync("tar", ["-xzf", file, "-C", into]);
};

console.log(`Package smoke check: ${path.relative(process.cwd(), pkg) || pkg}`);
untar(pkg, work);

// 1. Manifest
const manifestPath = path.join(work, "root-manifest.json");
const manifest = readJson(manifestPath);
const repoVersion = readJson(path.join(repo, "root-manifest.json")).version;
check(
  manifest.version === repoVersion,
  `manifest version ${manifest.version} (repo ${repoVersion})`,
);
const launch = manifest.package?.server?.launch;
check(typeof launch === "string", `server entry point ${launch}`);

// 2. Client bundle
untar(path.join(work, "client.tar.gz"), path.join(work, "client"));
const clientDeploy = manifest.package?.client?.deploy ?? "client/dist";
const clientIndex = path.join(work, "client", "app", clientDeploy, "index.html");
check(fs.existsSync(clientIndex), `client bundle has ${clientDeploy}/index.html`);

// 3. Generated networking versions
untar(path.join(work, "server.tar.gz"), path.join(work, "server"));
const app = path.join(work, "server", "app");
const want = protoVersion(path.join(repo, "networking/src"));
const genCopies = [
  "networking/gen/server/package.json",
  "node_modules/@studyroom/gen-server/package.json",
  "node_modules/@studyroom/gen-shared/package.json",
  "node_modules/@studyroom/gen-client/package.json",
];
for (const rel of genCopies) {
  const file = path.join(app, rel);
  const got = fs.existsSync(file) ? readJson(file).version : "missing";
  check(got === want, `${rel} is ${got} (proto ${want})`);
}

// 4. Boot the packaged server, twice on one database
const dbFile = path.join(work, "app.sqlite3");
const configFile = path.join(work, "fake-root.json");
fs.writeFileSync(configFile, JSON.stringify({ dbFile, manifest: manifestPath }));

function boot(label) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "--require",
        path.join(repo, "fake-root/register.cjs"),
        "--require",
        path.join(repo, "fake-root/probe.cjs"),
        path.join(app, launch),
      ],
      {
        cwd: app,
        env: { ...process.env, FAKE_ROOT_CONFIG: configFile, NODE_PATH: "" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => {
      out += `\n(timed out after ${BOOT_TIMEOUT_MS / 1000}s)`;
      child.kill("SIGKILL");
    }, BOOT_TIMEOUT_MS);
    child.on("exit", (code) => {
      clearTimeout(timer);
      const started = out.includes('"study squad started"');
      const probed = out.includes("probe: all passed");
      check(started, `${label}: server started`);
      check(probed && code === 0, `${label}: RPCs answered, clean stop (exit ${code})`);
      if (!started || !probed || code !== 0) {
        console.log("  ---- server output ----");
        console.log(out.replace(/^/gm, "  | "));
      }
      resolve();
    });
  });
}

await boot("first start");
await boot("restart on the same database");

fs.rmSync(work, { recursive: true, force: true });
if (failures.length > 0) {
  console.log(`\n${failures.length} check(s) failed. Don't upload this package.`);
  process.exit(1);
}
console.log("\nAll package checks passed.");
