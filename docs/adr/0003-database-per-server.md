# 0003. One SQLite database per Discord server

**Status:** Accepted, 2026-11-13

## Context

On Root, each community gets its own server process and its own SQLite file.
On Discord, one host serves every Discord server. The data could go in one
shared database keyed by server id, or one database per server.

## Decision

One SQLite file per Discord server, in `DATA_DIR/<server id>/`, exactly as
on Root. Cross-server questions (how many servers, total focus hours) are
answered offline by reading the files, not by sharing a live database.

## Consequences

- The server code doesn't change, and one server's data can never leak into
  another's, because no query can reach across files.
- Deleting or restoring one server is moving one folder.
- Sharding later (0009) is moving folders between boxes.
- No live cross-server queries. A global leaderboard would need its own
  small store if it's ever wanted.
