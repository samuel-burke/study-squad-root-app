# 0007. Litestream to S3 plus nightly disk snapshots

**Status:** Accepted, 2026-11-13

## Context

All Discord data lives in SQLite files on one disk. Losing the disk must not
lose more than a few seconds of study history.

## Decision

Two independent layers:

- **Litestream** runs the host as its child process and streams every
  database's write-ahead log to a versioned, encrypted S3 bucket within
  seconds. It watches the data folder, so a new Discord server is backed up
  from its first write.
- **EBS snapshots** of the data disk every night at 08:00 UTC, kept 7 days,
  via Data Lifecycle Manager.

## Consequences

- Point-in-time restore of any one server's database from S3, or of the
  whole disk from a snapshot (docs/INFRA.md).
- Costs cents a month at this size.
- Litestream needs SQLite in WAL mode, which the server already uses.
