# Feedback relay

A tiny Vercel function that turns Study Squad feedback notes into issues in a private GitHub repo. It exists so the GitHub token lives in Vercel's environment variables instead of inside the app package.

`POST /api/feedback` with `Authorization: Bearer <RELAY_KEY>` and `{ "text": "...", "sentAt": 1730700000000 }`. It answers 201 when the issue is open, 429 after `DAILY_CAP` notes in a UTC day, and 502 if GitHub refused. The app keeps a note and retries until it gets a 201.

Environment variables (Vercel → Project → Settings → Environment Variables):

| Name           | Value                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| `GITHUB_TOKEN` | Fine-grained token: only the feedback repo, only Issues read/write          |
| `GITHUB_REPO`  | `owner/name` of the private feedback repo                                   |
| `RELAY_KEY`    | A long random string; the same value goes in the app's `FEEDBACK_RELAY_KEY` |
| `DAILY_CAP`    | Optional, default 50                                                        |

The Vercel project's root directory is `feedback-relay`. See `docs/DEPLOYING.md`.
