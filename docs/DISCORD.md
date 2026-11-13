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

## The Activity client

`npm run build:discord -w @studyroom/client` (with `VITE_DISCORD_CLIENT_ID`
set to the app's id) builds the client into `client/dist-discord`. It is the
same app with RootGateway; only `@rootsdk/client-app` is swapped for
`client/src/discord/clientApp.ts`, which signs in through Discord's Embedded
App SDK (`identify` scope), then talks to the host over `/ws`. The Join voice
button and voice channel picker are hidden on Discord.

In the Developer Portal, under Activities → URL Mappings:

| Prefix         | Target                                                          |
| -------------- | --------------------------------------------------------------- |
| `/`            | the host's address (`terraform output url`, without `https://`) |
| `/discord-cdn` | `cdn.discordapp.com` (avatars)                                  |

## Discord-only screens

- **Server settings** (Room settings → Server settings) shows only to people with
  Manage Server or Administrator, or the owner. It is Root's App settings page
  rebuilt from `root-manifest.json`, and the host checks permission again on save.
- **Picture-in-picture**: when Discord shrinks the Activity to a short window
  (320px tall or less), the app shows `MiniView`: timer, round, how many are
  studying with the combo, and the boss bar.

## Try it without Discord

```sh
npm run build && VITE_DISCORD_CLIENT_ID=0 npm run build:discord -w @studyroom/client
node scripts/discord-dev-host.mjs
```

Then open `http://127.0.0.1:8090/?devUser=200000000000000002&devGuild=111111111111111111`
(Ana; `...001` is the server owner, `...003` is Ben). It runs the real host
against a fake Discord API with `devLogin`, which the real host never turns
on. `npm run test:e2e:discord` runs the Playwright tests on it.

## Run it for real

```sh
npm ci && npm run generate && npm run build
DISCORD_CLIENT_ID=... DISCORD_CLIENT_SECRET=... DISCORD_BOT_TOKEN=... npm start -w @studyroom/discord
```

`npx vitest run --project discord` tests the host end to end against a fake
Discord API.

Each Discord server's worker uses about 27 MB and is capped at 128 MB. A
server's worker sleeps after 15 minutes with nobody in the Activity and
nobody on a timer, and wakes for the next visitor or its next scheduled job
(a recap or session reminder), so memory follows active servers, not
installs. Each socket is rate limited, the bot posts to each channel one
message at a time, and the Activity reconnects on its own after a drop.

## Deploy

The host runs on AWS, set up with Terraform in `infra/`. See
[INFRA.md](INFRA.md) for the setup, costs, backups and day-to-day commands.

One-time setup in the **Discord Developer Portal**
(https://discord.com/developers/applications):

1. New Application, "Study Squad". Copy the **Application ID**.
2. OAuth2: copy the **Client Secret**. Add redirect `https://127.0.0.1`
   (the Activity flow doesn't use it, but Discord wants one).
3. Bot: Reset Token and copy the **bot token**. No privileged intents are needed.
4. Activities → Settings: turn on Activities. URL Mappings as in the table above.
5. Installation: Guild Install with scopes `bot` and `applications.commands`,
   bot permissions View Channels and Send Messages. Share that install link.

The three values go into AWS SSM Parameter Store (INFRA.md, step 3), never
into the repo or a chat.
