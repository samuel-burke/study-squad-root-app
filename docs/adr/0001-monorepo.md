# 0001. One repo for Root and Discord, with npm workspaces

**Status:** Accepted, 2026-11-13

## Context

Study Squad started as a Root app. Bringing it to Discord means two hosts
for the same game. The options were a second repo (copying or publishing the
shared code as packages) or one repo with both hosts side by side.

## Decision

One repo. The game engine (`core`), the API (`networking`, `contract`), the
server (`server`) and the client (`client`) are shared workspaces. Each
platform gets a thin host: Root's hosting for Root, `discord/` for Discord.
This is the same shape as one app shipped to iOS and Android from shared code.

## Consequences

- A rule change or bug fix lands on both platforms in one pull request, and CI
  tests both before anything ships.
- One version number and one changelog cover both.
- Platform code must stay at the edges. `server/src/main.ts` is the only file
  that imports Root's SDK, and the Discord host swaps it at load time (0004).
