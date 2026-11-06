// Preloaded after register.cjs by the packaged-build boot check. Once the
// server has started, it calls the read-only RPCs the way Root does (protobuf
// bytes in and out, through the generated service), logs each result, and
// stops the server. Any failure exits non-zero.
"use strict";

const path = require("node:path");
const { __fake: fake } = require("./server-app.cjs");

const PROBES = [
  ["GetRoom", "GetRoomRequest"],
  ["GetProgress", "GetProgressRequest"],
  ["GetLeaderboard", "GetLeaderboardRequest"],
  ["GetVoiceChannels", "GetVoiceChannelsRequest"],
  ["JoinRoomTimer", "JoinRoomTimerRequest"],
];

fake.onStarted = async () => {
  try {
    await probe();
  } catch (error) {
    process.exitCode = 1;
    console.error(
      JSON.stringify({
        level: "error",
        message: "probe: crashed",
        error: String(error?.stack ?? error),
      }),
    );
  }
  process.kill(process.pid, "SIGTERM");
};

async function probe() {
  const from = path.dirname(path.resolve(process.argv[1]));
  const shared = require(require.resolve("@studyroom/gen-shared", { paths: [from] }));
  const userId = fake.config.ownerUserId;
  let failed = 0;
  fake.attach(userId, "d-probe", () => {});
  for (const [method, requestType] of PROBES) {
    try {
      const bytes = shared[requestType].toBinary(shared[requestType].create({}));
      const response = await fake.call(`/.StudyRoomService/${method}`, bytes, userId, "d-probe");
      console.log(
        JSON.stringify({ level: "info", message: `probe ok ${method}`, bytes: response.length }),
      );
    } catch (error) {
      failed++;
      console.error(
        JSON.stringify({
          level: "error",
          message: `probe failed ${method}`,
          error: String(error?.stack ?? error),
        }),
      );
    }
  }
  fake.detach(userId, "d-probe");
  process.exitCode = failed > 0 ? 1 : 0;
  console.log(
    JSON.stringify({ level: "info", message: failed ? "probe: FAILED" : "probe: all passed" }),
  );
}
