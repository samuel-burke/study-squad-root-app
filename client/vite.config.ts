import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// `vite --mode demo` runs the real engine in the browser with simulated
// members, so the UI can be developed and tested without a Root dev token.
//
// `vite build --mode fakeroot` is the real Root client (RootGateway), but with
// @rootsdk/client-app swapped for the fake Root host's browser half, so the
// full-stack e2e tests (e2e-root/) can run the real server in CI.
export default defineConfig(({ mode }) => ({
  // Root serves the client from its own path, so asset URLs must be relative.
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@studyroom/core": source("../core/src/index.ts"),
      "@studyroom/contract": source("../contract/src/index.ts"),
      ...(mode === "fakeroot"
        ? { "@rootsdk/client-app": source("../fake-root/client-app.js") }
        : {}),
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
}));
