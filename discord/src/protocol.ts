import type { PlainSettings } from "./rootSettings";

/** What each Discord server's worker thread starts with. */
export interface WorkerData {
  guildId: string;
  /** This server's own folder: database, settings and jobs. */
  dir: string;
  /** The Study Squad server's built main.js, run unchanged in the worker. */
  serverMain: string;
  manifestPath: string;
  botToken: string;
  /** Discord's API, or a fake one in tests. */
  apiBase?: string;
  jobPollMs?: number;
}

/** Main thread to worker. */
export type ToWorker =
  | { t: "call"; id: number; path: string; bytes: Uint8Array; userId: string; deviceId: string }
  | { t: "attach"; userId: string; deviceId: string }
  | { t: "detach"; userId: string; deviceId: string }
  | { t: "settings"; id: number; plain: PlainSettings }
  | { t: "stop" };

/** Worker to main thread. */
export type FromWorker =
  | { t: "ready" }
  | { t: "failed"; error: string }
  | { t: "reply"; id: number; bytes: Uint8Array }
  | { t: "reply"; id: number; code: number; message: string }
  | { t: "push"; path: string; bytes: Uint8Array; deviceIds: string[] }
  | { t: "settings-saved"; id: number }
  | { t: "stopped" };
