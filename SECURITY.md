# Security policy

## Reporting a vulnerability

Please report security issues privately through [GitHub security advisories](https://github.com/samuel-burke/study-room-root/security/advisories/new), not as a public issue. You'll get a reply within a week. Please include steps to reproduce and the impact you see.

## Supported versions

Only the latest release on `main` gets fixes.

## How Study Squad protects members

| Risk                                  | Control                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acting as another member              | The server takes the user id from the authenticated Root connection only. No request contains a user id.                                                                                                                                                                                                                                                                  |
| Touching another member's goals       | Every goal operation checks ownership; "missing" and "not yours" return the same error.                                                                                                                                                                                                                                                                                   |
| Leaking private goals                 | Room state is built with private goal text removed. Personal data is broadcast only to the member's own devices.                                                                                                                                                                                                                                                          |
| Malicious input                       | Goal text is length-limited and stripped of control, zero-width and bidi-override characters. Ids, numbers and booleans are type- and range-checked on the server. Settings from Root are parsed defensively and clamped.                                                                                                                                                 |
| Injection                             | All database access goes through knex with bound parameters. React escapes all rendered text; there is no `dangerouslySetInnerHTML`.                                                                                                                                                                                                                                      |
| Mentions or markup in channel posts   | Nicknames and boss names are stripped of mention and markdown characters (such as `@`, `<`, `>`, `*`, `#`) before posting.                                                                                                                                                                                                                                                |
| Abuse and spam                        | Per-user rate limits on every request. Busy-room posts have a cool-down.                                                                                                                                                                                                                                                                                                  |
| Error details leaking                 | Unexpected errors return a generic message; the stack is logged server-side. Logs contain ids and counts, never goal text.                                                                                                                                                                                                                                                |
| Secrets                               | The Root dev token lives in `server/.env`, which is git-ignored. `.env.example` documents it without a value. Root has no secret storage, so the GitHub token for feedback lives on the feedback relay (Vercel environment variables). The package only carries the relay's address and key, which can post a note but can't read anything; the relay caps notes per day. |
| Third-party requests from inside Root | Fonts are bundled; the client makes no requests except through the Root SDK.                                                                                                                                                                                                                                                                                              |
| Data deletion                         | Members erase their own data from the app (Delete my data). The server only ever erases the caller's own records.                                                                                                                                                                                                                                                         |
| Permissions                           | The manifest asks only for `channelView` and `channelCreateMessage`, for posting recaps.                                                                                                                                                                                                                                                                                  |
| Supply chain                          | Dependabot, dependency review on pull requests, CodeQL, and pinned Root SDK versions.                                                                                                                                                                                                                                                                                     |

## Known advisories

`@rootsdk/server-app` asks for `sqlite3@^5.1.7`, which pulls in `node-gyp` and `tar@6` with high and critical advisories. `package.json` overrides it to `sqlite3@^6.0.1`, which uses a fixed `tar@7`. The full SQLite test suite passes on 6.x. Revisit the override when the SDK updates its own requirement.

One advisory remains in packages installed by Root's SDK:

- `uuid@10` (required by `@rootsdk/server-app` and `@rootsdk/client-app`): the advisory affects the v3/v5/v6 functions with a caller-provided buffer, which Study Squad doesn't use.

We'll pick up fixed versions as Root updates the SDK.
