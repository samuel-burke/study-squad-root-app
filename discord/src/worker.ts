/**
 * Entry point of one Discord server's worker thread. Every require of
 * @rootsdk/server-app, the generated networking code's included, gets the
 * Discord stand-in (serverApp.ts), then the unchanged Study Squad server runs.
 * Each worker has its own copy of every module, so servers never share state.
 */
import Module from "node:module";
import { workerData } from "node:worker_threads";
import type { WorkerData } from "./protocol";

const standIn = require.resolve("./serverApp");
const moduleInternals = Module as unknown as {
  _resolveFilename(request: string, ...rest: unknown[]): string;
};
const resolve = moduleInternals._resolveFilename;
moduleInternals._resolveFilename = function (request, ...rest) {
  if (request === "@rootsdk/server-app") return standIn;
  return resolve.call(this, request, ...rest);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
require((workerData as WorkerData).serverMain);
