import { execSync } from "node:child_process";
import path from "node:path";

/**
 * The host test runs the real, built server in worker threads, so build it
 * (and the host) first. Takes a few seconds; tsc skips unchanged output.
 */
export default function setup() {
  execSync(
    "npm run build -w @studyroom/core -w @studyroom/contract -w @studyroom/server -w @studyroom/discord",
    { cwd: path.join(__dirname, "../.."), stdio: "ignore" },
  );
}
