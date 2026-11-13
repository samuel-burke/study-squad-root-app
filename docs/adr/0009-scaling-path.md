# 0009. How it scales past one box

**Status:** Accepted, 2026-11-13 (a plan; only stage 1 is built)

## Context

One t4g.micro holds about 30 busy Discord servers. Growth should be a series
of small steps, each taken only when monitoring shows it's needed.

## Decision

1. **Idle sleep** (built, 0006): memory follows active servers.
2. **Bigger box:** change `instance_type` (t4g.small 2 GB, t4g.medium 4 GB).
   One line of Terraform, a few seconds of downtime.
3. **Shard by server:** several boxes, each owning a set of Discord servers
   (each server's folder lives on exactly one box, 0003). A small stateless
   gateway in front reads a directory table (server id → box) and routes the
   WebSocket. Moving a server is: sleep it, copy its folder, update the row.
4. **Smaller pushes:** send room changes as diffs instead of whole rooms once
   rooms get very large.

## Consequences

- Nothing in the game code changes at any stage.
- Stage 3 adds a gateway and a directory store; it's the first stage that
  costs real engineering, so it waits for real load.
