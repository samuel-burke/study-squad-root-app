// Bakes what the self-test panel needs into server/dist/build-info.json:
// the app version, the networking version this build was generated for, and
// who may run the self-test. On Root the server then compares that version
// with the networking code it actually loaded, which is how a stale cached
// copy (the 0.3.0/0.3.1 crash) would show.
//
// SELF_TEST_USER_IDS is a comma-separated list of Root user ids, read from the
// environment, else from server/.env. Without it, nobody can run the self-test,
// and community admins see their own id in Room settings to add.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { protoVersion } from "./proto-version.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, "server", "dist", "build-info.json");

function readEnvFile(file) {
  try {
    return Object.fromEntries(
      fs
        .readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((line) => line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/))
        .filter(Boolean)
        .map(([, key, value]) => [key, value.replace(/^(["'])(.*)\1$/, "$2")]),
    );
  } catch {
    return {};
  }
}

const env = readEnvFile(path.join(root, "server", ".env"));
const ids = (process.env.SELF_TEST_USER_IDS || env.SELF_TEST_USER_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const manifest = JSON.parse(fs.readFileSync(path.join(root, "root-manifest.json"), "utf8"));
// Each setting's type (number, checkbox, select, channel, time), so the
// self-test can say whether Root sends it in the shape the fake Root host uses.
const settingTypes = Object.fromEntries(
  (manifest.settings?.groups ?? []).map((group) => [
    group.key,
    Object.fromEntries(
      group.items.map((item) => [
        item.key,
        ["number", "checkbox", "select", "channel", "time"].find((t) => t in item) ?? "other",
      ]),
    ),
  ]),
);

const info = {
  version: manifest.version,
  genVersion: protoVersion(path.join(root, "networking", "src")),
  selfTestUserIds: ids,
  settingTypes,
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(info));
console.log(
  `build info: ${info.version}, ${info.genVersion}, self-test for ${ids.length} user id(s)`,
);
