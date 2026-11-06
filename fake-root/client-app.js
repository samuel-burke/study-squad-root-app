// A stand-in for @rootsdk/client-app in the browser, used by the `fakeroot`
// client build (vite --mode fakeroot). It talks to the fake Root host
// (transport.cjs) over a WebSocket, sending the same protobuf bytes the
// generated client would hand Root. Open the app with ?user=<userId> to be
// that member; ?theme=light|dark sets Root's theme.

export const ImageUriResolution = {
  Original: "original",
  Large: "large",
  Medium: "medium",
  Small: "small",
};

export class EventEmitter {
  #listeners = new Map();
  on(event, listener) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(listener);
    return this;
  }
  addListener(event, listener) {
    return this.on(event, listener);
  }
  once(event, listener) {
    const wrapped = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };
    return this.on(event, wrapped);
  }
  off(event, listener) {
    this.#listeners.get(event)?.delete(listener);
    return this;
  }
  removeListener(event, listener) {
    return this.off(event, listener);
  }
  removeAllListeners(event) {
    if (event === undefined) this.#listeners.clear();
    else this.#listeners.delete(event);
    return this;
  }
  emit(event, ...args) {
    const listeners = [...(this.#listeners.get(event) ?? [])];
    for (const listener of listeners) listener(...args);
    return listeners.length > 0;
  }
  listenerCount(event) {
    return this.#listeners.get(event)?.size ?? 0;
  }
}

const params = new URLSearchParams(window.location.search);
const userId = params.get("user") ?? "u-owner";
const themeParam = params.get("theme");

const toBase64 = (bytes) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** path -> client method definition from the generated client's __register() */
const definitions = new Map();
const pending = new Map();
let seq = 0;

const socketUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/root?user=${encodeURIComponent(userId)}`;
const socket = new WebSocket(socketUrl);
const opened = new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", () => reject(new Error("fake Root host unreachable")), {
    once: true,
  });
});

socket.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.t === "push") {
    const def = definitions.get(msg.path);
    if (!def) {
      // An unknown push means the client and server were built from different protos.
      console.warn("fake-root: push for a path this client doesn't know");
      return;
    }
    def.funct(def.responseDeserialize(fromBase64(msg.b)));
    return;
  }
  const waiting = pending.get(msg.id);
  if (!waiting) return;
  pending.delete(msg.id);
  if (msg.t === "ok") waiting.resolve(msg);
  else
    waiting.reject(Object.assign(new Error(msg.message), { code: msg.code, message: msg.message }));
});

socket.addEventListener("close", (event) => {
  for (const waiting of pending.values())
    waiting.reject(new Error(`connection closed: ${event.reason}`));
  pending.clear();
});

async function request(payload) {
  await opened;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ ...payload, id }));
  });
}

const themeEmitter = new EventEmitter();

export const rootClient = {
  addClient(service) {
    for (const def of service.__register()) definitions.set(def.path, def);
  },
  async sendWithResponse(path, message) {
    const def = definitions.get(path);
    if (!def) throw new Error(`fake-root: no client definition for ${path}`);
    const reply = await request({ t: "call", path, b: toBase64(def.requestSerialize(message)) });
    return def.responseDeserialize(fromBase64(reply.b));
  },
  users: {
    getCurrentUserId: () => userId,
    async getUserProfiles(ids) {
      return (await request({ t: "profiles", ids })).profiles;
    },
  },
  assets: {
    toImageUrl: (uri, resolution) => `${uri}?size=${resolution}`,
  },
  theme: {
    getTheme: () => (themeParam === "light" || themeParam === "dark" ? themeParam : "dark"),
    on: (event, listener) => themeEmitter.on(event, listener),
    off: (event, listener) => themeEmitter.off(event, listener),
  },
};

// For tests: the theme Root would switch to.
window.__fakeRootTheme = (mode) => themeEmitter.emit("theme.update", mode);
