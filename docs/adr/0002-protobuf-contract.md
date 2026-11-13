# 0002. Protobuf is the API contract on both platforms

**Status:** Accepted, 2026-11-13

## Context

On Root, client and server must talk in Protobuf: Root generates the
service stubs from `networking/src/studyroom.proto` and carries the bytes.
The Discord host could have used a new JSON API instead.

## Decision

Keep Protobuf on Discord. The Discord host carries the same bytes over a
WebSocket (`{t: "call", path, b: base64}`), so the generated client and
server run unchanged.

## Consequences

- One schema, one set of generated types, and no second API to keep in sync.
- Messages are small and typed, and old clients keep working when fields are
  added, which matters because Activities stay open for hours.
- The bytes are base64 inside JSON frames, about a third larger than raw
  binary. That's small next to the cost of a second API.
