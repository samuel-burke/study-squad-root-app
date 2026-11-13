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
type WithId = Extract<ToWorker, { id: number }>;
/** A worker message that gets a reply, before its id is added. */
type Request = { [T in WithId["t"]]: Omit<Extract<WithId, { t: T }>, "id"> }[WithId["t"]];

/** Discord ids are numbers ("snowflakes"); anything else never names a folder. */
const SNOWFLAKE = /^\d{5,25}$/;

const log = (level: string, message: string, meta: Record<string, unknown>) =>
  console.log(JSON.stringify({ level, message, ...meta, at: new Date().toISOString() }));

/** One Discord server's copy of the Study Squad server, in its own worker thread. */
class Guild {
  private readonly worker: Worker;
  private readonly waiting = new Map<number, (message: FromWorker) => void>();
  private seq = 0;
  readonly ready: Promise<void>;
  private stopped: (() => void) | null = null;
  /** Open Activities in this server. */
  readonly devices = new Set<string>();
  idleTimer: NodeJS.Timeout | null = null;

  constructor(
    data: WorkerData,
    memoryMb: number,
    private readonly pushes: Map<string, Push>,
    onExit: (code: number) => void,
  ) {
    this.worker = new Worker(path.join(__dirname, "worker.js"), {
      workerData: data,
      // One runaway server can't starve the others; it restarts on its next request.
      resourceLimits: { maxOldGenerationSizeMb: memoryMb },
    });
    this.ready = new Promise((resolve, reject) => {
      this.worker.on("message", (message: FromWorker) => {
        if (message.t === "ready") resolve();
        else if (message.t === "failed") reject(new Error(message.error));
        else if (message.t === "push") {
          for (const id of message.deviceIds) this.pushes.get(id)?.(message.path, message.bytes);
        } else if (message.t === "stopped") this.stopped?.();
        else this.waiting.get(message.id)?.(message);
      });
      this.worker.on("error", (error) => {
        log("error", "server worker crashed", { guildId: data.guildId, error: String(error) });
        reject(error);
      });
      this.worker.on("exit", (code) => {
        reject(new Error("worker exited"));
        for (const done of this.waiting.values())
          done({ t: "reply", id: 0, code: 14, message: "Study Squad restarted. Try again." });
        this.waiting.clear();
        onExit(code);
      });
    });
  }

  post(message: ToWorker) {
    this.worker.postMessage(message);
  }

  request(message: Request) {
    const id = ++this.seq;
    return new Promise<FromWorker>((resolve) => {
      this.waiting.set(id, (reply) => {
        this.waiting.delete(id);
        resolve(reply);
      });
      this.post({ ...message, id } as ToWorker);
    });
  }

  async quiet() {
    const reply = await this.request({ t: "status" });
    return reply.t === "status" && reply.quiet;
  }

  async stop() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
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
  /** A server with nobody in it and nobody on a timer sleeps after this long. Default 15 min. */
  idleMs?: number;
  /** Heap cap per server. Default 128 MB. */
  memoryMb?: number;
}

/**
 * Every Discord server's Study Squad. A server's worker starts when someone
 * opens the Activity there or one of its jobs comes due, and sleeps once
 * it's been empty and quiet for a while, so only active servers use memory.
 */
export class Guilds {
  private readonly running = new Map<string, Guild>();
  private readonly stopping = new Map<string, Promise<void>>();
  /** deviceId -> its socket's push. */
  private readonly pushes = new Map<string, Push>();
  private jobTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: GuildsOptions) {}

  /** Starts every server that has used Study Squad before, and wakes sleepers when a job is due. */
  async startKnown() {
    await Promise.allSettled(
      this.known().map((id) => this.get(id).then((g) => this.idleSoon(id, g))),
    );
    this.jobTimer = setInterval(() => this.wakeForJobs(), this.options.jobPollMs ?? 30_000);
    this.jobTimer.unref();
  }

  async get(guildId: string): Promise<Guild> {
    if (!SNOWFLAKE.test(guildId)) throw new CallError(3, "That isn't a Discord server.");
    // Never run two copies of a server: let a sleeping one finish closing first.
    await this.stopping.get(guildId);
    let guild = this.running.get(guildId);
    if (!guild) {
      const dir = path.join(this.options.dataDir, guildId);
      fs.mkdirSync(dir, { recursive: true });
      const { dataDir: _d, idleMs: _i, memoryMb, ...rest } = this.options;
      const started: Guild = new Guild(
        { ...rest, guildId, dir },
        memoryMb ?? 128,
        this.pushes,
        (code) => {
          if (code !== 0) log("warn", "server worker exited", { guildId, code });
          if (this.running.get(guildId) === started) this.running.delete(guildId);
        },
      );
      guild = started;
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

  /** Whether a server's worker is running (for tests and logs). */
  isRunning(guildId: string) {
    return this.running.has(guildId);
  }

  async attach(guildId: string, userId: string, deviceId: string, push: Push) {
    const guild = await this.get(guildId);
    if (guild.idleTimer) clearTimeout(guild.idleTimer);
    guild.devices.add(deviceId);
    this.pushes.set(deviceId, push);
    guild.post({ t: "attach", userId, deviceId });
  }

  detach(guildId: string, userId: string, deviceId: string) {
    this.pushes.delete(deviceId);
    const guild = this.running.get(guildId);
    if (!guild) return;
    guild.devices.delete(deviceId);
    guild.post({ t: "detach", userId, deviceId });
    this.idleSoon(guildId, guild);
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
    const guild = await this.get(guildId);
    await guild.request({ t: "settings", plain });
    this.idleSoon(guildId, guild);
  }

  async stopAll() {
    if (this.jobTimer) clearInterval(this.jobTimer);
    await Promise.allSettled([...this.stopping.values()]);
    await Promise.allSettled([...this.running.values()].map((g) => g.stop()));
    this.running.clear();
  }

  /** Once nobody is connected, checks back later and puts the server to sleep if it's quiet. */
  private idleSoon(guildId: string, guild: Guild) {
    if (guild.devices.size > 0) return;
    if (guild.idleTimer) clearTimeout(guild.idleTimer);
    guild.idleTimer = setTimeout(
      () => void this.sleepIfIdle(guildId, guild),
      this.options.idleMs ?? 15 * 60_000,
    );
    guild.idleTimer.unref();
  }

  private async sleepIfIdle(guildId: string, guild: Guild) {
    if (this.running.get(guildId) !== guild || guild.devices.size > 0) return;
    if (!(await guild.quiet().catch(() => false))) return this.idleSoon(guildId, guild);
    this.running.delete(guildId);
    const done = guild.stop().finally(() => this.stopping.delete(guildId));
    this.stopping.set(guildId, done);
    await done;
    log("info", "server asleep", { guildId });
  }

  private known() {
    const dir = this.options.dataDir;
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((id) => SNOWFLAKE.test(id)) : [];
  }

  /** Wakes each sleeping server that has a job due; its worker fires the job on start. */
  private wakeForJobs() {
    const now = Date.now();
    for (const guildId of this.known()) {
      if (this.running.has(guildId) || this.stopping.has(guildId)) continue;
      const jobs = readJobs(path.join(this.options.dataDir, guildId, "jobs.json"));
      if (!jobs.some((job) => job.start <= now)) continue;
      void this.get(guildId)
        .then((guild) => this.idleSoon(guildId, guild))
        .catch((error: unknown) =>
          log("error", "could not wake server", { guildId, error: String(error) }),
        );
    }
  }
}

function readJobs(file: string): { start: number }[] {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as { start: number }[];
  } catch {
    return [];
  }
}
