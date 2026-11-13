/* eslint-disable @typescript-eslint/no-explicit-any -- the SDK's listeners take any arguments */
/**
 * A stand-in for @rootsdk/server-app inside one Discord server's worker
 * thread (see worker.ts). The unchanged Study Squad server runs on top of it,
 * one copy per Discord server, the way Root runs one copy per community.
 * It talks to the main thread (main.ts) for everything that crosses servers:
 * sockets, sign-in and shutdown.
 */
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import * as shared from "@studyroom/gen-shared";
import { discordCommunity } from "./community";
import { DiscordApi } from "./discordApi";
import { JOB_EVENT, JobScheduler } from "./jobs";
import type { FromWorker, ToWorker, WorkerData } from "./protocol";
import {
  readManifest,
  readPlainSettings,
  toRootSettings,
  type PlainSettings,
} from "./rootSettings";

const data = workerData as WorkerData;
const port = parentPort!;
const send = (message: FromWorker) => port.postMessage(message);

// ---- the parts of the SDK's exports the server uses (values from 0.21.3) ----

export const ChannelType = { Unspecified: 0, Text: 1, ThreadedText: 2, Voice: 4, App: 8 };
export const ClientEvent = { UserAttached: "user.attached", UserDetached: "user.detached" };
export const ChannelWebRtcEvent = {
  ChannelWebRtcUserAttach: "channelWebRtcUser.attach",
  ChannelWebRtcUserDetach: "channelWebRtcUser.detach",
};
export const GlobalSettingsEvent = { Update: "update", Button: "button" };
export const ChannelMessageEvent = { ChannelMessageCreated: "channelMessage.created" };
export const JobInterval = {
  Unspecified: 0,
  OneTime: 1,
  Daily: 2,
  Weekly: 3,
  Monthly: 4,
  Yearly: 5,
};
export const JobScheduleEvent = JOB_EVENT;
// On Discord, a server's @everyone role has the server's own id.
export const WellKnownRootGuids = { CommunityRoles: { EveryoneRole: data.guildId } };

export class RootServerException extends Error {
  constructor(
    readonly code = 0,
    message = "",
  ) {
    super(message);
    this.name = "RootServerException";
  }
}

// ---- clients (people with the Activity open) ----

interface ClientEntry {
  client: { communityId: string; userId: string; deviceIds: string[] };
}
const attached = new Map<string, ClientEntry>();
const clientEvents = new EventEmitter();

const clients = {
  getClients: () => [...attached.values()].map((e) => e.client),
  getClient: (userId: string) => attached.get(userId)?.client,
  on: (event: string, listener: (...args: any[]) => void) => (
    clientEvents.on(event, listener),
    clients
  ),
  off: (event: string, listener: (...args: any[]) => void) => (
    clientEvents.off(event, listener),
    clients
  ),
};

function attach(userId: string, deviceId: string) {
  let entry = attached.get(userId);
  const first = !entry;
  if (!entry) {
    entry = { client: { communityId: data.guildId, userId, deviceIds: [] } };
    attached.set(userId, entry);
  }
  entry.client.deviceIds = [...new Set([...entry.client.deviceIds, deviceId])];
  if (first) clientEvents.emit(ClientEvent.UserAttached, entry.client);
}

function detach(userId: string, deviceId: string) {
  const entry = attached.get(userId);
  if (!entry) return;
  entry.client.deviceIds = entry.client.deviceIds.filter((d) => d !== deviceId);
  if (entry.client.deviceIds.length > 0) return;
  attached.delete(userId);
  clientEvents.emit(ClientEvent.UserDetached, entry.client);
}

// ---- services and broadcasts ----

interface MethodDef {
  path: string;
  requestDeserialize(bytes: Uint8Array): unknown;
  responseSerialize(message: unknown): Uint8Array;
  funct(request: unknown, client: unknown): Promise<unknown>;
}
const methods = new Map<string, MethodDef>();

/** '/.StudyRoomService/BroadcastRoomUpdated' -> the generated RoomUpdatedEvent type */
function broadcastType(broadcastPath: string): { toBinary(message: unknown): Uint8Array } {
  const name = `${broadcastPath
    .split("/")
    .pop()!
    .replace(/^Broadcast/, "")}Event`;
  const type = (shared as unknown as Record<string, { toBinary(m: unknown): Uint8Array }>)[name];
  if (!type) throw new Error(`no message type ${name} for ${broadcastPath}`);
  return type;
}

function sendBroadcast(
  broadcastPath: string,
  message: unknown,
  to: "all" | string | { userId: string }[],
  except?: { deviceId?: string },
) {
  const userIds =
    to === "all" || to === data.guildId
      ? [...attached.keys()]
      : Array.isArray(to)
        ? to.map((c) => c.userId)
        : [];
  const deviceIds = userIds
    .flatMap((u) => attached.get(u)?.client.deviceIds ?? [])
    .filter((d) => d !== except?.deviceId);
  if (deviceIds.length === 0) return;
  send({
    t: "push",
    path: broadcastPath,
    bytes: broadcastType(broadcastPath).toBinary(message),
    deviceIds,
  });
}

async function call(
  id: number,
  methodPath: string,
  bytes: Uint8Array,
  userId: string,
  deviceId: string,
) {
  try {
    const def = methods.get(methodPath);
    if (!def) throw new RootServerException(12, "Unknown request. Reload Study Squad.");
    const client = { communityId: data.guildId, userId, deviceId, deviceIds: [deviceId] };
    const response = await def.funct(def.requestDeserialize(bytes), client);
    send({ t: "reply", id, bytes: def.responseSerialize(response) });
  } catch (error) {
    const code = error instanceof RootServerException ? error.code : 0;
    if (code === 0)
      console.error(
        JSON.stringify({
          level: "error",
          message: "request failed",
          path: methodPath,
          error: String((error as Error)?.stack ?? error),
        }),
      );
    send({ t: "reply", id, code, message: code > 0 ? (error as Error).message : "" });
  }
}

// ---- settings ----

const settingsFile = path.join(data.dir, "settings.json");
const manifest = readManifest(data.manifestPath);
const settingsEvents = new EventEmitter();

function makeGlobalSettings(plain: PlainSettings) {
  const delivered = toRootSettings(plain, manifest);
  Object.defineProperty(delivered, "on", {
    value: (event: string, listener: (...args: any[]) => void) =>
      settingsEvents.on(event, listener),
    enumerable: false,
  });
  return delivered;
}

function saveSettings(plain: PlainSettings) {
  fs.writeFileSync(settingsFile, JSON.stringify(plain));
  const previous = rootServer.globalSettings;
  rootServer.globalSettings = makeGlobalSettings(plain);
  settingsEvents.emit(GlobalSettingsEvent.Update, { previous, current: rootServer.globalSettings });
}

// ---- the server's view of Root ----

const jobScheduler = new JobScheduler(path.join(data.dir, "jobs.json"));

export const rootServer = {
  globalSettings: makeGlobalSettings(readPlainSettings(settingsFile)),
  dataStore: { config: { sqlite3: { filename: path.join(data.dir, "study-squad.sqlite3") } } },
  clients,
  community: discordCommunity(
    data.guildId,
    new DiscordApi({ botToken: data.botToken, base: data.apiBase }),
  ),
  jobScheduler,
  sendBroadcast,
  lifecycle: {
    addService: (service: { __register(): MethodDef[] }) => {
      for (const def of service.__register()) methods.set(def.path, def);
    },
    start: async (
      onStarting: (state: unknown) => Promise<void>,
      onStopping: () => Promise<void>,
    ) => {
      port.on("message", (message: ToWorker) => {
        switch (message.t) {
          case "call":
            void call(message.id, message.path, message.bytes, message.userId, message.deviceId);
            break;
          case "attach":
            attach(message.userId, message.deviceId);
            break;
          case "detach":
            detach(message.userId, message.deviceId);
            break;
          case "settings":
            saveSettings(message.plain);
            send({ t: "settings-saved", id: message.id });
            break;
          case "stop":
            void onStopping().finally(() => send({ t: "stopped" }));
            break;
        }
      });
      try {
        await onStarting({ globalSettings: rootServer.globalSettings });
      } catch (error) {
        send({ t: "failed", error: String((error as Error)?.stack ?? error) });
        return;
      }
      // Root looks for due jobs about once a minute; so does this.
      jobScheduler.runDue();
      setInterval(() => jobScheduler.runDue(), data.jobPollMs ?? 30_000).unref();
      send({ t: "ready" });
    },
  },
};
