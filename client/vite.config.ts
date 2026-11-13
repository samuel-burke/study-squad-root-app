import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const readJson = (path: string) => JSON.parse(readFileSync(source(path), "utf8"));

/** The app and networking versions, for the self-test panel's version check. */
function buildInfo() {
  let genVersion = "unknown";
  try {
    genVersion = readJson("../networking/gen/client/package.json").version;
  } catch {
    // Not generated yet (npm run generate).
  }
  return { version: readJson("../root-manifest.json").version as string, genVersion };
}

// `vite --mode demo` runs the real engine in the browser with simulated
// members, so the UI can be developed and tested without a Root dev token.
//
// `vite build --mode discord` is the Discord Activity: RootGateway again, with
// @rootsdk/client-app swapped for the Discord sign-in and socket (src/discord/).
//
// `vite build --mode fakeroot` is the real Root client (RootGateway), but with
// @rootsdk/client-app swapped for the fake Root host's browser half, so the
// full-stack e2e tests (e2e-root/) can run the real server in CI.
export default defineConfig(({ mode }) => ({
  // Root serves the client from its own path, so asset URLs must be relative.
  base: "./",
  plugins: [react()],
  define: { __BUILD_INFO__: JSON.stringify(buildInfo()) },
  resolve: {
    alias: {
      "@studyroom/core": source("../core/src/index.ts"),
      "@studyroom/contract": source("../contract/src/index.ts"),
      ...(mode === "fakeroot"
        ? { "@rootsdk/client-app": source("../fake-root/client-app.js") }
        : {}),
      ...(mode === "discord"
        ? { "@rootsdk/client-app": source("./src/discord/clientApp.ts") }
        : {}),
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
    // three.js (the 3D badge medal) is one ~600 kB chunk, loaded only when a badge unlocks.
    chunkSizeWarningLimit: 650,
  },
  server: {
    port: 5173,
    // `vite --mode discord` talks to a local Discord host (npm start -w @studyroom/discord).
    proxy:
      mode === "discord"
        ? { "/api": "http://127.0.0.1:8080", "/ws": { target: "ws://127.0.0.1:8080", ws: true } }
        : undefined,
  },
}));
