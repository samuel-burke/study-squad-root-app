# Feedback relay

A tiny Vercel function that turns Study Squad feedback notes into issues in a private GitHub repo. It exists so the GitHub token lives in Vercel's environment variables instead of inside the app package.

`POST /api/feedback` with `Authorization: Bearer <RELAY_KEY>` and `{ "text": "...", "sentAt": 1730700000000 }`. It answers 201 when the issue is open, 429 after `DAILY_CAP` notes in a UTC day, and 502 if GitHub refused. The app keeps a note and retries until it gets a 201.

Environment variables (Vercel → Project → Settings → Environment Variables):

| Name                | Value                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GITHUB_TOKEN`      | Fine-grained token: only the feedback repo, only Issues read/write                                           |
| `GITHUB_REPO`       | `owner/name` of the private feedback repo                                                                    |
| `RELAY_KEY`         | A long random string; the same value goes in the app's `FEEDBACK_RELAY_KEY`                                  |
| `DAILY_CAP`         | Optional, default 50                                                                                         |
| `SLACK_WEBHOOK_URL` | Optional Slack incoming webhook; each new note is posted there too. If Slack fails, the issue is still made. |

It runs as the Vercel project `study-squad-feedback` at `https://study-squad-feedback.vercel.app/api/feedback`. The project isn't linked to git yet, so a change here needs a redeploy of this folder. See `docs/DEPLOYING.md`.
