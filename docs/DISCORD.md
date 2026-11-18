# Study Squad on Discord

Study Squad also runs as a Discord Activity. The game, the client UI and
the server stay the same; only the host underneath changes.

## How it works

On Root, Root's hosting runs one copy of the server per community and hands
it `@rootsdk/server-app`. The Discord host (`discord/`) does the same:

- `discord/src/host.ts` is one Node process. It serves the Activity's
  client, swaps Discord sign-in codes for tokens (`POST /api/token`), and
  carries each open Activity's requests over a WebSocket (`/ws`).
- Each Discord server gets its own **worker thread** that runs the unchanged
  `server/dist/main.js`. Inside it, `@rootsdk/server-app` resolves to
  `discord/src/serverApp.ts`, which answers Root's calls from Discord:
  members and roles come from the bot, posts go out as the bot, and Root's
  `[@Name](root://user/id)` mentions become `<@id>`.
- Each Discord server's data lives in `DATA_DIR/<server id>/`: its SQLite
  database, its settings and its scheduled jobs.
- Admins are the server owner and roles with Administrator or Manage Server
  (the server's existing `canManageApps` check, fed Discord's roles).

Not on Discord yet: who is in a voice channel (needs Discord's live
gateway), and the developer's chat commands (need the message content
intent).

## Environment

| Variable                | What it is                                                                     |
| ----------------------- | ------------------------------------------------------------------------------ |
| `DISCORD_CLIENT_ID`     | The app's id (Developer Portal, General Information).                          |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret. Secret.                                                  |
| `DISCORD_BOT_TOKEN`     | The bot's token (Bot tab). Secret.                                             |
| `DATA_DIR`              | Where each server's data goes. Default `./data`. Must be on a persistent disk. |
| `PORT`                  | Default 8080.                                                                  |
| `STATIC_DIR`            | The built client. Default `client/dist-discord`.                               |

Never commit or paste the secret values; set them in the host's secret
settings.

## Run it locally

```sh
npm ci && npm run generate && npm run build
DISCORD_CLIENT_ID=... DISCORD_CLIENT_SECRET=... DISCORD_BOT_TOKEN=... npm start -w @studyroom/discord
```

`npx vitest run --project discord` tests the host end to end against a fake
Discord API.

Each Discord server's worker uses about 27 MB, so a 1 GB machine holds
roughly 30 active servers. Stopping idle servers' workers is the next step
once that matters.
