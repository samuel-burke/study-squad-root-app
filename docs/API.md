# Client/server API

The contract is `networking/src/studyroom.proto`. `npm run generate` turns it into TypeScript in `networking/gen/` (client, server and shared message types). The `contract` package maps those messages to the engine's DTOs.

## Conventions

- **Identity** comes from the authenticated Root connection (`client.userId` on the server). No request carries a user id, so a member can only act as themselves.
- **Timestamps** are Unix epoch milliseconds in `double` fields (exact up to 2^53), avoiding int64-as-string handling.
- **Enums** have an `UNSPECIFIED = 0` value. Decoders map unknown values to safe states (idle, break).
- **Optional fields**: `goals_private` on start requests is `optional`: unset means "keep my current choice". `goal_prompt` on a personal result is absent when there's no open goal.

## Requests

| RPC                    | Request                                        | Returns        | Notes                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetRoom`              | —                                              | `RoomSnapshot` | Room state plus your status. Also used to sample the clock offset.                                                                                                                                                                                                                                                     |
| `JoinRoomTimer`        | `goals[]` (≤ 3), `goals_private?`              | `RoomSnapshot` | Starts a cycle if the room is idle. Idempotent. Fails if your solo timer is running.                                                                                                                                                                                                                                   |
| `LeaveRoomTimer`       | —                                              | `RoomSnapshot` | Credits minutes so far if mid-round.                                                                                                                                                                                                                                                                                   |
| `StartSolo`            | `minutes` (5–180), `goals[]`, `goals_private?` | `RoomSnapshot` | Fails if you're on the room timer.                                                                                                                                                                                                                                                                                     |
| `EndSolo`              | —                                              | `RoomSnapshot` | Ends a solo focus early (minutes credited) or skips the solo break.                                                                                                                                                                                                                                                    |
| `AddGoal`              | `text` (1–140 chars)                           | `MyStatus`     | Up to 8 open goals. Text is whitespace-collapsed and stripped of control and bidi characters.                                                                                                                                                                                                                          |
| `SetGoalDone`          | `goal_id`, `done`                              | `MyStatus`     | +25 XP the first time a goal is done.                                                                                                                                                                                                                                                                                  |
| `DeleteGoal`           | `goal_id`                                      | `MyStatus`     |                                                                                                                                                                                                                                                                                                                        |
| `SetGoalsPrivate`      | `goals_private`                                | `MyStatus`     |                                                                                                                                                                                                                                                                                                                        |
| `DeleteMyData`         | —                                              | `MyStatus`     | Erases everything stored about the caller in this community. Cannot be undone.                                                                                                                                                                                                                                         |
| `GetProgress`          | —                                              | `Progress`     | Your status, 35 days of focus, this week's quests, your badges and your card look.                                                                                                                                                                                                                                     |
| `SetCardStyle`         | `style` (a card style id, or empty)            | `Progress`     | Empty goes back to automatic. Fails if the style is still locked.                                                                                                                                                                                                                                                      |
| `SetBadgeShowcase`     | `badge_ids[]` (≤ 1, earned)                    | `Progress`     | The badge for your card. Empty shows your newest.                                                                                                                                                                                                                                                                      |
| `GetLeaderboard`       | `by`, `period`                                 | `Leaderboard`  | The top 10 for `period` (this week, month, year or all time) by whole focus minutes, or by XP when `by` is `LEADERBOARD_METRIC_XP` (ties share a rank), plus your own rank, minutes and XP. Each entry carries both totals. Hidden members are never listed. Unset `by` means minutes; unset `period` means this week. |
| `SetLeaderboardHidden` | `hidden`, `by`                                 | `Leaderboard`  | Hide yourself from the leaderboard and recap rankings, or show yourself again. Returns the board for `by` and `period`.                                                                                                                                                                                                |

## Broadcasts (server → client)

| Event                       | Sent to               | When                                                                          |
| --------------------------- | --------------------- | ----------------------------------------------------------------------------- |
| `RoomUpdated` (`RoomState`) | everyone              | After any change to the board, timer, boss or settings                        |
| `PhaseCompleted`            | everyone              | A room phase ended: round, finisher ids, combo, damage, new room state        |
| `PersonalResult`            | that member's devices | After a focus block you took part in: XP math, streak, goal prompt, break end |
| `MyStatus`                  | that member's devices | After a change to your status, goals or XP (keeps your other devices in sync) |
| `BadgesEarned`              | that member's devices | Badge ids you just earned (the catalog lives in `@studyroom/core`)            |

Badges are also carried in `MyStatus.new_badge_ids`, on the reply to the action that earned them and on the status push, so the unlock still plays if the `BadgesEarned` push is lost. The client shows each badge once however many ways it arrives.

`RoomState` never contains another member's private goal text, XP total or goal list.

## Errors

Failures reach the client as `RootServerException` with a `code` and a message safe to show:

| Code | Meaning                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------- |
| 1001 | Validation failed (the message says what to fix)                                                  |
| 1002 | Not found (also used for "not yours", so ids can't be probed)                                     |
| 1003 | Conflict, e.g. starting a solo timer while on the room timer                                      |
| 1004 | Rate limited (per user: 20 writes in a burst, refilling at 2 per second; reads 30 / 5 per second) |
| 1500 | Unexpected server error. Details are logged on the server, never sent to the client               |
| 503  | The server is still starting                                                                      |

Root's own negative codes (timeouts, rate limits) are shown to members as a generic "couldn't reach Study Squad" message.
