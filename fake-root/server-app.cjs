// A stand-in for @rootsdk/server-app, so the real server (server/dist/main.js)
// can run outside Root: in the packaged-build boot check and the full-stack e2e
// tests. It is not a mock of the happy path. It copies the ways the real SDK
// has surprised us on Root, so those bugs fail here first:
//
// - Number settings arrive as { value: n }, not as a number (fixed in 0.3.7).
// - JobData.jobTime arrives as epoch milliseconds, not a Date, and a job whose
//   handler throws is never marked done, so it fires again (PR #98).
// - clients.getClient(userId) never finds anyone (root-sdk getClient bug, PR #51).
// - Unknown members and channels reject with RootServerException.
//
// Everything Root would decide is read from a JSON file named by FAKE_ROOT_CONFIG
// (see defaultConfig below). Tests drive it through `module.exports.__fake`.
"use strict";

const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// ---- enums, copied from the SDK's index.d.ts (0.21.3) ----

const ChannelType = { Unspecified: 0, Text: 1, ThreadedText: 2, Voice: 4, App: 8 };
const ClientEvent = {
  UserAttached: "user.attached",
  UserDetached: "user.detached",
  UserDeviceAttached: "user.device.attached",
  UserDeviceDetached: "user.device.detached",
};
const ChannelWebRtcEvent = {
  ChannelWebRtcUserAttach: "channelWebRtcUser.attach",
  ChannelWebRtcUserDetach: "channelWebRtcUser.detach",
};
const GlobalSettingsEvent = { Update: "update", Button: "button" };
const JobInterval = { Unspecified: 0, OneTime: 1, Daily: 2, Weekly: 3, Monthly: 4, Yearly: 5 };
const JobScheduleEvent = { JobMissed: "job.missed", Job: "job" };
const EVERYONE_ROLE = "00000000-0000-0000-0000-00000000e000";
const WellKnownRootGuids = { CommunityRoles: { EveryoneRole: EVERYONE_ROLE } };

class RootServerException extends Error {
  constructor(code = 0, message = "", _callingFunction) {
    super(message);
    this.name = "RootServerException";
    this.code = code;
  }
  toString() {
    return `RootServerException(${this.code}): ${this.message}`;
  }
}
const NOT_FOUND = 5;

// ---- configuration ----

function defaultConfig() {
  return {
    communityId: "c0000000-0000-0000-0000-000000000001",
    ownerUserId: "u-owner",
    dbFile: path.join(os.tmpdir(), `fake-root-${process.pid}.sqlite3`),
    /** Path to root-manifest.json, used to deliver settings in Root's shapes. */
    manifest: null,
    /** Plain values by group and key, e.g. { room: { busyThreshold: 3 } }. */
    settings: {},
    members: [
      { userId: "u-owner", nickname: "Owner", roleIds: [] },
      { userId: "u-ana", nickname: "Ana", roleIds: [] },
      { userId: "u-ben", nickname: "Ben", roleIds: [] },
      { userId: "u-cy", nickname: "Cy", roleIds: [] },
      { userId: "u-dee", nickname: "Dee", roleIds: [] },
      { userId: "u-eli", nickname: "Eli", roleIds: [] },
      { userId: "u-fay", nickname: "Fay", roleIds: [] },
    ],
    roles: [{ id: EVERYONE_ROLE, name: "everyone", permissions: {} }],
    channelGroups: [{ id: "g-main", name: "Main" }],
    channels: [
      { id: "ch-general", name: "general", channelType: ChannelType.Text, groupId: "g-main" },
      { id: "ch-study", name: "study-squad", channelType: ChannelType.Text, groupId: "g-main" },
      { id: "ch-voice", name: "Study Hall", channelType: ChannelType.Voice, groupId: "g-main" },
    ],
    /** How often the job scheduler looks for due jobs. Root checks about once a minute. */
    jobPollMs: 60_000,
  };
}

function readConfig() {
  const config = defaultConfig();
  const file = process.env.FAKE_ROOT_CONFIG;
  if (file) Object.assign(config, JSON.parse(fs.readFileSync(file, "utf8")));
  return config;
}

/**
 * Turns plain setting values into the shapes Root delivers, going by each
 * item's type in root-manifest.json. Values not given fall back to the
 * manifest's defaultValue, like an untouched settings page.
 */
function toRootSettings(plain, manifestPath) {
  if (!manifestPath) return structuredClone(plain);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const out = {};
  for (const group of manifest.settings?.groups ?? []) {
    const values = plain[group.key] ?? {};
    const delivered = {};
    for (const item of group.items) {
      const has = Object.prototype.hasOwnProperty.call(values, item.key);
      const v = values[item.key];
      if (item.number) {
        // The quirk: Root wraps numbers.
        const n = has ? v : item.number.defaultValue;
        if (n !== undefined) delivered[item.key] = { value: n };
      } else if (item.checkbox) {
        const b = has ? v : item.checkbox.defaultValue;
        if (b !== undefined) delivered[item.key] = b;
      } else if (item.select) {
        const keys = has ? v : item.select.values;
        if (keys !== undefined) delivered[item.key] = Array.isArray(keys) ? keys : [keys];
      } else if (item.channel) {
        if (has && v) delivered[item.key] = Array.isArray(v) ? v : [v];
      } else if (item.time) {
        const t = has ? v : item.time.defaultValue;
        if (t !== undefined) delivered[item.key] = t;
      } else if (has) {
        delivered[item.key] = v;
      }
    }
    out[group.key] = delivered;
  }
  return out;
}

const config = readConfig();

// Root's clock, which tests can move forward (fake.advanceClock). The server
// reads Date.now for its engine clock, so this must run before main.js does.
const realNow = Date.now;
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;
const log = (message, meta = {}) =>
  console.log(JSON.stringify({ level: "info", message: `fake-root: ${message}`, ...meta }));

// ---- clients (people with the app open) ----

/** userId -> { client, devices: Map<deviceId, send(path, bytes)> } */
const attached = new Map();
const clientsEmitter = new EventEmitter();

const clients = {
  getClients: () => [...attached.values()].map((e) => e.client),
  // The quirk: the real SDK builds its lookup key wrongly and finds no one.
  getClient: (_userId) => undefined,
  on: (event, listener) => (clientsEmitter.on(event, listener), clients),
  off: (event, listener) => (clientsEmitter.off(event, listener), clients),
};

// ---- services and broadcasts ----

/** path -> method definition from the generated service's __register() */
const methods = new Map();
let genShared = null;

function loadGenShared() {
  if (genShared) return genShared;
  const from = path.dirname(path.resolve(process.argv[1] ?? "."));
  genShared = require(require.resolve("@studyroom/gen-shared", { paths: [from] }));
  return genShared;
}

/** '/.StudyRoomService/BroadcastRoomUpdated' -> RoomUpdatedEvent */
function broadcastType(broadcastPath) {
  const name =
    broadcastPath
      .split("/")
      .pop()
      .replace(/^Broadcast/, "") + "Event";
  const type = loadGenShared()[name];
  if (!type) throw new Error(`fake-root: no message type ${name} for ${broadcastPath}`);
  return type;
}

function targets(to) {
  if (to === "all" || to === config.communityId) return [...attached.keys()];
  if (Array.isArray(to)) return to.map((c) => c.userId);
  return [];
}

const sent = [];

function sendBroadcast(broadcastPath, message, to, except) {
  const bytes = broadcastType(broadcastPath).toBinary(message);
  for (const userId of targets(to)) {
    const entry = attached.get(userId);
    if (!entry) continue;
    for (const [deviceId, send] of entry.devices) {
      if (except?.deviceId === deviceId) continue;
      sent.push({ path: broadcastPath, userId, bytes: bytes.length });
      send(broadcastPath, bytes);
    }
  }
}

/** Runs one RPC the way Root's host does: bytes in, bytes out. */
async function call(methodPath, requestBytes, userId, deviceId) {
  const def = methods.get(methodPath);
  if (!def) throw new RootServerException(12, `unknown method ${methodPath}`);
  const client = {
    communityId: config.communityId,
    userId,
    deviceId,
    deviceIds: deviceId ? [deviceId] : [],
  };
  const request = def.requestDeserialize(requestBytes);
  const response = await def.funct(request, client);
  return def.responseSerialize(response);
}

// ---- community data ----

const members = new Map(config.members.map((m) => [m.userId, m]));
const posts = [];

function notFound(what, id) {
  return new RootServerException(NOT_FOUND, `${what} ${id} not found`);
}

function findChannel(id) {
  const c = config.channels.find((ch) => ch.id === id);
  if (!c) throw notFound("channel", id);
  return c;
}

const voice = new Map(); // channelId -> Set<userId>
const webRtcEmitter = new EventEmitter();

const community = {
  communities: {
    get: async () => ({
      id: config.communityId,
      name: "Fake Root",
      ownerUserId: config.ownerUserId,
    }),
  },
  channelGroups: {
    list: async () => config.channelGroups.map((g) => ({ ...g, communityId: config.communityId })),
  },
  channels: {
    list: async ({ channelGroupId }) =>
      config.channels
        .filter((c) => c.groupId === channelGroupId)
        .map((c) => ({ ...c, channelGroupId: c.groupId })),
    get: async ({ id }) => findChannel(id),
  },
  communityLinks: {
    communityChannelCreate: async ({ channelId }) => ({
      url: `https://fake.rootapp.test/${config.communityId}/${findChannel(channelId).id}`,
    }),
  },
  channelMessages: {
    create: async ({ channelId, content }) => {
      findChannel(channelId);
      const post = { id: `m${posts.length + 1}`, channelId, content, at: Date.now() };
      posts.push(post);
      return post;
    },
  },
  communityMembers: {
    get: async ({ userId }) => {
      const m = members.get(userId);
      if (!m) throw notFound("member", userId);
      return { userId, nickname: m.nickname, communityId: config.communityId };
    },
  },
  communityMemberRoles: {
    list: async ({ userId }) => ({
      userId,
      communityRoleIds: [EVERYONE_ROLE, ...(members.get(userId)?.roleIds ?? [])],
    }),
  },
  communityRoles: {
    list: async () => config.roles,
  },
  channelWebRtcs: {
    list: async ({ channelId }) => ({
      members: [...(voice.get(channelId) ?? [])].map((userId) => ({ userId, channelId })),
    }),
    on: (event, listener) => webRtcEmitter.on(event, listener),
    off: (event, listener) => webRtcEmitter.off(event, listener),
  },
};

// ---- job scheduler ----

const jobsEmitter = new EventEmitter();
const jobs = []; // { id, tag, resourceId, start: number, done }
let jobSeq = 0;

function runDueJobs(now = Date.now()) {
  for (const job of jobs.filter((j) => !j.done && j.start <= now)) {
    // The quirk: jobTime is epoch ms. A throwing handler leaves the job undone.
    const data = {
      id: BigInt(job.id),
      jobScheduleId: `js${job.id}`,
      resourceId: job.resourceId,
      tag: job.tag,
      jobTime: job.start,
    };
    try {
      jobsEmitter.emit(JobScheduleEvent.Job, data);
      job.done = true;
    } catch (error) {
      job.failures = (job.failures ?? 0) + 1;
      log("job handler threw, job stays due", { tag: job.tag, error: String(error) });
    }
  }
}

const jobScheduler = {
  create: async ({ resourceId, tag, start, jobInterval }) => {
    if (jobInterval !== JobInterval.OneTime) throw new Error("fake-root: only OneTime jobs");
    const at = start instanceof Date ? start.getTime() : Number(start);
    const job = { id: ++jobSeq, tag, resourceId, start: at, done: false };
    jobs.push(job);
    return { id: `js${job.id}` };
  },
  deleteByTag: async (tag) => {
    for (let i = jobs.length - 1; i >= 0; i--)
      if (jobs[i].tag === tag && !jobs[i].done) jobs.splice(i, 1);
  },
  on: (event, listener) => jobsEmitter.on(event, listener),
  off: (event, listener) => jobsEmitter.off(event, listener),
};

// ---- settings ----

const settingsEmitter = new EventEmitter();
let plainSettings = structuredClone(config.settings);

function makeGlobalSettings() {
  const delivered = toRootSettings(plainSettings, config.manifest);
  Object.defineProperty(delivered, "on", {
    value: (event, listener) => settingsEmitter.on(event, listener),
    enumerable: false,
  });
  return delivered;
}

// ---- lifecycle ----

let stopping = null;

const rootServer = {
  globalSettings: makeGlobalSettings(),
  dataStore: { config: { sqlite3: { filename: config.dbFile } } },
  clients,
  community,
  jobScheduler,
  sendBroadcast,
  lifecycle: {
    addService: (service) => {
      for (const def of service.__register()) methods.set(def.path, def);
      log("service added", { methods: methods.size });
    },
    start: async (onStarting, onStopping) => {
      const stop = async (signal) => {
        if (stopping) return stopping;
        log("stopping", { signal });
        stopping = Promise.resolve(onStopping?.()).finally(() =>
          process.exit(process.exitCode ?? 0),
        );
        return stopping;
      };
      process.once("SIGTERM", () => void stop("SIGTERM"));
      process.once("SIGINT", () => void stop("SIGINT"));
      await onStarting({ globalSettings: rootServer.globalSettings });
      const timer = setInterval(() => runDueJobs(), config.jobPollMs);
      timer.unref();
      log("started", { db: config.dbFile });
      await fake.onStarted?.();
    },
  },
};

// ---- the test-facing control panel ----

const fake = {
  config,
  posts,
  sent,
  jobs,
  methods,
  call,
  runDueJobs,
  /** Called once onStarting has finished; transports hook in here. */
  onStarted: null,
  attach(userId, deviceId, send) {
    let entry = attached.get(userId);
    const first = !entry;
    if (!entry) {
      entry = {
        client: { communityId: config.communityId, userId, deviceIds: [] },
        devices: new Map(),
      };
      attached.set(userId, entry);
    }
    entry.devices.set(deviceId, send);
    entry.client.deviceIds = [...entry.devices.keys()];
    if (first) clientsEmitter.emit(ClientEvent.UserAttached, entry.client);
  },
  detach(userId, deviceId) {
    const entry = attached.get(userId);
    if (!entry) return;
    entry.devices.delete(deviceId);
    entry.client.deviceIds = [...entry.devices.keys()];
    if (entry.devices.size === 0) {
      attached.delete(userId);
      clientsEmitter.emit(ClientEvent.UserDetached, entry.client);
    }
  },
  /** Moves the clock forward. The next request the server handles catches up. */
  advanceClock(ms) {
    clockOffset += ms;
    return Date.now();
  },
  /** Changes settings the way an admin saving the App settings page would. */
  updateSettings(plain) {
    const previous = rootServer.globalSettings;
    plainSettings = structuredClone(plain);
    rootServer.globalSettings = makeGlobalSettings();
    settingsEmitter.emit(GlobalSettingsEvent.Update, {
      previous,
      current: rootServer.globalSettings,
    });
  },
  joinVoice(channelId, userId) {
    if (!voice.has(channelId)) voice.set(channelId, new Set());
    voice.get(channelId).add(userId);
    webRtcEmitter.emit(ChannelWebRtcEvent.ChannelWebRtcUserAttach, { channelId, userId });
  },
  leaveVoice(channelId, userId) {
    voice.get(channelId)?.delete(userId);
    webRtcEmitter.emit(ChannelWebRtcEvent.ChannelWebRtcUserDetach, { channelId, userId });
  },
  nickname: (userId) => members.get(userId)?.nickname,
  attachedUsers: () => [...attached.keys()],
};

module.exports = {
  rootServer,
  RootServerException,
  ChannelType,
  ChannelWebRtcEvent,
  ClientEvent,
  GlobalSettingsEvent,
  JobInterval,
  JobScheduleEvent,
  WellKnownRootGuids,
  toRootSettings,
  __fake: fake,
};
