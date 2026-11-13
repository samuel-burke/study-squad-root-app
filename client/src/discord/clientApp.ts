/**
 * Stands in for @rootsdk/client-app in the Discord Activity build
 * (vite --mode discord), so RootGateway and the generated client run
 * unchanged. It signs in through Discord, then sends the same protobuf bytes
 * Root would carry to the Discord host (discord/src/host.ts) over a WebSocket.
 */
import { DiscordSDK } from "@discord/embedded-app-sdk";

export const ImageUriResolution = {
  Original: "original",
  Large: "large",
  Medium: "medium",
  Small: "small",
} as const;
export type RootThemeMode = "light" | "dark";

type Listener = (...args: never[]) => void;

/** The small event emitter the generated client extends. */
export class EventEmitter {
  #listeners = new Map<string, Set<Listener>>();
  on(event: string, listener: Listener) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event)!.add(listener);
    return this;
  }
  addListener(event: string, listener: Listener) {
    return this.on(event, listener);
  }
  off(event: string, listener: Listener) {
    this.#listeners.get(event)?.delete(listener);
    return this;
  }
  removeListener(event: string, listener: Listener) {
    return this.off(event, listener);
  }
  emit(event: string, ...args: unknown[]) {
    const listeners = [...(this.#listeners.get(event) ?? [])];
    for (const listener of listeners) (listener as (...a: unknown[]) => void)(...args);
    return listeners.length > 0;
  }
}

interface MethodDef {
  path: string;
  requestSerialize(message: unknown): Uint8Array;
  responseDeserialize(bytes: Uint8Array): unknown;
  funct(message: unknown): void;
}

const toBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Something the member should read, like "Ask an admin to add the bot". */
export class SignInError extends Error {
  override name = "SignInError";
}

const definitions = new Map<string, MethodDef>();
const pending = new Map<number, { resolve(m: Reply): void; reject(e: unknown): void }>();
type Reply = {
  t: string;
  id?: number;
  b?: string;
  code?: number;
  message?: string;
  profiles?: unknown;
};
let seq = 0;
let userId = "";
let socket: WebSocket | null = null;
let opened: Promise<void> = Promise.reject(new Error("not signed in"));
opened.catch(() => {});

/**
 * Opens the socket and signs it in. If it drops (a phone sleeping, say) it
 * reconnects with the same token, and the app's next request goes through.
 */
function connect(hello: object): Promise<void> {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  const ws = new WebSocket(url);
  socket = ws;
  opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => ws.send(JSON.stringify(hello)), { once: true });
    ws.addEventListener("error", () => reject(new SignInError("Couldn't reach Study Squad.")), {
      once: true,
    });
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data)) as Reply & { path?: string; userId?: string };
      if (msg.t === "hello") {
        userId = msg.userId!;
        return resolve();
      }
      if (msg.t === "denied") return reject(new SignInError(msg.message));
      if (msg.t === "push") {
        const def = definitions.get(msg.path!);
        if (def) def.funct(def.responseDeserialize(fromBase64(msg.b!)));
        return;
      }
      const waiting = pending.get(msg.id!);
      if (!waiting) return;
      pending.delete(msg.id!);
      if (msg.t === "ok") waiting.resolve(msg);
      else
        waiting.reject(
          Object.assign(new Error(msg.message), { code: msg.code, message: msg.message }),
        );
    });
    ws.addEventListener("close", (event) => {
      for (const waiting of pending.values()) waiting.reject(new Error("connection lost"));
      pending.clear();
      if (event.code === 4003) return;
      // Reconnect after a moment, unless sign-in itself was refused.
      setTimeout(() => {
        if (socket === ws) connect(hello).catch(() => {});
      }, 2000);
    });
  });
  opened.catch(() => {});
  return opened;
}

async function request(payload: object): Promise<Reply> {
  await opened;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket!.send(JSON.stringify({ ...payload, id }));
  });
}

/** Avatars come from Discord's CDN, reached through the Activity's URL mapping. */
const CDN = "https://cdn.discordapp.com/";
const CDN_SIZE = { original: 512, large: 256, medium: 128, small: 64 } as const;

const themeEmitter = new EventEmitter();

export const rootClient = {
  addClient(service: { __register(): MethodDef[] }) {
    for (const def of service.__register()) definitions.set(def.path, def);
  },
  async sendWithResponse(methodPath: string, message: unknown) {
    const def = definitions.get(methodPath);
    if (!def) throw new Error(`no client definition for ${methodPath}`);
    const reply = await request({
      t: "call",
      path: methodPath,
      b: toBase64(def.requestSerialize(message)),
    });
    return def.responseDeserialize(fromBase64(reply.b!));
  },
  users: {
    getCurrentUserId: () => userId,
    async getUserProfiles(ids: string[]) {
      return (await request({ t: "profiles", ids })).profiles as {
        id: string;
        nickname: string;
        profilePictureUri: string;
      }[];
    },
  },
  assets: {
    toImageUrl: (uri: string, resolution: keyof typeof CDN_SIZE) =>
      uri.startsWith(CDN)
        ? `/discord-cdn/${uri.slice(CDN.length)}?size=${CDN_SIZE[resolution]}`
        : uri,
  },
  theme: {
    // Discord doesn't tell Activities its theme; the app follows the device.
    getTheme: (): RootThemeMode | undefined => undefined,
    on: (event: string, listener: Listener) => themeEmitter.on(event, listener),
    off: (event: string, listener: Listener) => themeEmitter.off(event, listener),
  },
};

/**
 * Signs in through Discord before the app renders. Local testing without
 * Discord: open /?devUser=<id>&devGuild=<id> against a host started with
 * DISCORD_DEV_LOGIN=1.
 */
export async function signIn(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const devUser = params.get("devUser");
  if (devUser) {
    // The host refuses this unless it was started with DISCORD_DEV_LOGIN=1.
    return connect({ t: "auth", dev: { userId: devUser, guildId: params.get("devGuild") ?? "" } });
  }
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID as string;
  const discord = new DiscordSDK(clientId);
  await discord.ready();
  if (!discord.guildId) throw new SignInError("Open Study Squad in a server, not a DM.");
  const { code } = await discord.commands.authorize({
    client_id: clientId,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: ["identify"],
  });
  const response = await fetch("/api/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw new SignInError("Discord sign-in failed. Reopen Study Squad.");
  const { access_token } = (await response.json()) as { access_token: string };
  await discord.commands.authenticate({ access_token });
  await connect({ t: "auth", accessToken: access_token, guildId: discord.guildId });
}
