import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { FromWorker, ToWorker, WorkerData } from "./protocol";
import type { PlainSettings } from "./rootSettings";

/** An error the server meant the member to see, as Root hands it to the client. */
export class CallError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

type Push = (path: string, bytes: Uint8Array) => void;

/** Discord ids are numbers ("snowflakes"); anything else never names a folder. */
const SNOWFLAKE = /^\d{5,25}$/;

/** One Discord server's copy of the Study Squad server, in its own worker thread. */
class Guild {
  private readonly worker: Worker;
  private readonly waiting = new Map<number, (message: FromWorker) => void>();
  private seq = 0;
  readonly ready: Promise<void>;
  private stopped: (() => void) | null = null;

  constructor(
    data: WorkerData,
    private readonly devices: Map<string, Push>,
    onExit: () => void,
  ) {
    this.worker = new Worker(path.join(__dirname, "worker.js"), { workerData: data });
    this.ready = new Promise((resolve, reject) => {
      this.worker.on("message", (message: FromWorker) => {
        if (message.t === "ready") resolve();
        else if (message.t === "failed") reject(new Error(message.error));
        else if (message.t === "push") {
          for (const id of message.deviceIds) this.devices.get(id)?.(message.path, message.bytes);
        } else if (message.t === "stopped") this.stopped?.();
        else this.waiting.get(message.id)?.(message);
      });
      this.worker.on("error", reject);
      this.worker.on("exit", () => {
        reject(new Error("worker exited"));
        for (const done of this.waiting.values())
          done({ t: "reply", id: 0, code: 14, message: "Study Squad restarted. Try again." });
        this.waiting.clear();
        onExit();
      });
    });
  }

  post(message: ToWorker) {
    this.worker.postMessage(message);
  }

  request(
    message:
      | Omit<Extract<ToWorker, { t: "call" }>, "id">
      | Omit<Extract<ToWorker, { t: "settings" }>, "id">,
  ) {
    const id = ++this.seq;
    return new Promise<FromWorker>((resolve) => {
      this.waiting.set(id, (reply) => {
        this.waiting.delete(id);
        resolve(reply);
      });
      this.post({ ...message, id } as ToWorker);
    });
  }

  async stop() {
    await new Promise<void>((resolve) => {
      this.stopped = resolve;
      this.post({ t: "stop" });
      // Don't hang shutdown on a stuck worker.
      setTimeout(resolve, 10_000).unref();
    });
    await this.worker.terminate();
  }
}

export interface GuildsOptions {
  dataDir: string;
  serverMain: string;
  manifestPath: string;
  botToken: string;
  apiBase?: string;
  jobPollMs?: number;
}

/**
 * Every Discord server's Study Squad, started the first time someone opens
 * the Activity there and kept running so timers and scheduled posts fire.
 */
export class Guilds {
  private readonly running = new Map<string, Guild>();
  /** deviceId -> its socket's push. */
  private readonly devices = new Map<string, Push>();

  constructor(private readonly options: GuildsOptions) {}

  /** Starts every server that has used Study Squad before, so their jobs fire. */
  async startKnown() {
    const ids = fs.existsSync(this.options.dataDir) ? fs.readdirSync(this.options.dataDir) : [];
    await Promise.allSettled(ids.filter((id) => SNOWFLAKE.test(id)).map((id) => this.get(id)));
  }

  async get(guildId: string): Promise<Guild> {
    if (!SNOWFLAKE.test(guildId)) throw new CallError(3, "That isn't a Discord server.");
    let guild = this.running.get(guildId);
    if (!guild) {
      const dir = path.join(this.options.dataDir, guildId);
      fs.mkdirSync(dir, { recursive: true });
      const { dataDir: _, ...rest } = this.options;
      guild = new Guild({ ...rest, guildId, dir }, this.devices, () => {
        if (this.running.get(guildId) === guild) this.running.delete(guildId);
      });
      this.running.set(guildId, guild);
    }
    try {
      await guild.ready;
    } catch (error) {
      this.running.delete(guildId);
      throw error;
    }
    return guild;
  }

  async attach(guildId: string, userId: string, deviceId: string, push: Push) {
    const guild = await this.get(guildId);
    this.devices.set(deviceId, push);
    guild.post({ t: "attach", userId, deviceId });
  }

  detach(guildId: string, userId: string, deviceId: string) {
    this.devices.delete(deviceId);
    this.running.get(guildId)?.post({ t: "detach", userId, deviceId });
  }

  /** Runs one request: protobuf bytes in, bytes out, like Root's host. */
  async call(
    guildId: string,
    methodPath: string,
    bytes: Uint8Array,
    userId: string,
    deviceId: string,
  ) {
    const guild = await this.get(guildId);
    const reply = await guild.request({ t: "call", path: methodPath, bytes, userId, deviceId });
    if (reply.t !== "reply") throw new Error("unexpected worker reply");
    if ("code" in reply) throw new CallError(reply.code, reply.message);
    return reply.bytes;
  }

  async saveSettings(guildId: string, plain: PlainSettings) {
    await (await this.get(guildId)).request({ t: "settings", plain });
  }

  async stopAll() {
    await Promise.allSettled([...this.running.values()].map((g) => g.stop()));
    this.running.clear();
  }
}
