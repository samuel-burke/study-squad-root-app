// Bakes the feedback destination into server/dist, because Root has no secret
// storage. Reads FEEDBACK_GITHUB_TOKEN + FEEDBACK_GITHUB_REPO (issues in a
// private repo) from the environment, else from server/.env. Without both,
// any old file is removed and the feedback box stays hidden.
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
const githubToken = get("FEEDBACK_GITHUB_TOKEN");
const githubRepo = get("FEEDBACK_GITHUB_REPO");

if (githubToken && githubRepo) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ githubToken, githubRepo }), { mode: 0o600 });
  console.log(`feedback: notes go to issues in ${githubRepo}`);
} else {
  fs.rmSync(out, { force: true });
  console.log("feedback: no FEEDBACK_GITHUB_TOKEN/REPO set, feedback box hidden");
}
