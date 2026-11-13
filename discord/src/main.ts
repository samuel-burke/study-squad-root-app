/**
 * Starts the Discord Activity's server. Settings come from the environment
 * (see docs/DISCORD.md); the bot token and client secret are never logged.
 */
import path from "node:path";
import { createHost } from "./host";

const repo = path.resolve(__dirname, "../..");
const env = process.env;

function required(name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const host = createHost({
  clientId: required("DISCORD_CLIENT_ID"),
  clientSecret: required("DISCORD_CLIENT_SECRET"),
  botToken: required("DISCORD_BOT_TOKEN"),
  dataDir: path.resolve(env.DATA_DIR ?? path.join(repo, "data")),
  serverMain: path.join(repo, "server/dist/main.js"),
  manifestPath: path.join(repo, "root-manifest.json"),
  staticDir: env.STATIC_DIR ?? path.join(repo, "client/dist-discord"),
  devLogin: env.DISCORD_DEV_LOGIN === "1",
});

host
  .listen(Number(env.PORT ?? 8080))
  .then((address) =>
    console.log(JSON.stringify({ level: "info", message: "discord host listening", address })),
  )
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({ level: "error", message: "failed to start", error: String(error) }),
    );
    process.exit(1);
  });

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => void host.close().finally(() => process.exit(0)));
}
