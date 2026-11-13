# 0004. One worker thread per Discord server, behind a Root SDK shim

**Status:** Accepted, 2026-11-13

## Context

`server/dist/main.js` expects to be the only community in its process: it
reads Root's SDK, opens one database and keeps the room in memory. Rewriting
it to serve many communities would touch every use case.

## Decision

The Discord host runs each Discord server's copy of the unchanged server in
its own `worker_thread`. Inside each worker, `@rootsdk/server-app` resolves
to `discord/src/serverApp.ts`, which answers the same calls from Discord's
REST API (members, roles, channels, bot posts) and from local files (settings,
jobs). Messages between the host and a worker are typed in `protocol.ts`.

## Consequences

- No changes to `server` or `core`. Root and Discord run the same game code.
- A crash or memory leak stays in one worker (heap capped at 128 MB) and the
  worker restarts on the next request.
- Each worker costs about 27 MB, which is why quiet ones sleep (0006).
- The shim only covers the parts of Root's SDK the server uses. Voice
  presence and reading chat aren't there yet; both need Discord's gateway.
