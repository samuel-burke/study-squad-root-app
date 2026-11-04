// Bakes the feedback relay's address and key into server/dist, because Root has
// no secret storage. The GitHub token stays on the relay (feedback-relay/).
// Reads FEEDBACK_RELAY_URL + FEEDBACK_RELAY_KEY from the environment, else from
// server/.env. Without both, any old file is removed and the box stays hidden.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, "server", "dist", "feedback.json");

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

const file = readEnvFile(path.join(root, "server", ".env"));
const get = (key) => (process.env[key] || file[key] || "").trim();
const relayUrl = get("FEEDBACK_RELAY_URL");
const relayKey = get("FEEDBACK_RELAY_KEY");

if (relayUrl && relayKey) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ relayUrl, relayKey }), { mode: 0o600 });
  console.log(`feedback: notes go to ${relayUrl}`);
} else {
  fs.rmSync(out, { force: true });
  console.log("feedback: no FEEDBACK_RELAY_URL/KEY set, feedback box hidden");
}
