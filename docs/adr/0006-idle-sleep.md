# 0006. Quiet servers sleep and wake on demand

**Status:** Accepted, 2026-11-13

## Context

Every Discord server that installs Study Squad would otherwise keep a
worker (about 27 MB) running forever, so memory would grow with installs,
not with use. But a server can't simply stop: room timers, daily recaps and
session reminders run on it.

## Decision

A worker sleeps after 15 minutes with nobody in the Activity and nobody on a
timer (the last room update had no members). It wakes when someone opens the
Activity, and the host checks each sleeping server's `jobs.json` every 30
seconds and wakes it when a job is due. A server never runs twice: waking
waits for any shutdown in progress.

## Consequences

- Memory follows active servers. A 1 GB box holds about 30 busy servers and
  any number of sleeping ones.
- The first person to open a sleeping server waits for the worker to start
  (well under a second for small databases).
- Jobs fire up to 30 seconds late on a sleeping server, which is fine for
  recaps and reminders.
