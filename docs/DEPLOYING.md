# Deploying to Root

Every push to `main` that passes CI uploads the app to Root, through the **Deploy to Root** job in `.github/workflows/ci.yml`.

## How it decides

- It reads `version` from `root-manifest.json`. Root rejects a version it already has, so each upload is tagged `root-v<version>`, and a version with a tag is skipped.
- With no `ROOT_AUTH_TOKEN` secret, it skips the upload and says so in the run summary.
- It always builds from a clean `networking/gen`, since stale generated code once crashed the app on Root.

So to ship: bump the version (in `root-manifest.json`, every `package.json`, and the workspace entries in `package-lock.json`), merge `dev` into `main`, and the job does the rest.

## One-time setup

1. Create a token at dev.rootapp.com → Settings → Tokens.
2. In GitHub, open the repo's **Settings → Secrets and variables → Actions → New repository secret**. Name it `ROOT_AUTH_TOKEN` and paste the token.

Never put the token in code, chat or an issue. GitHub hides it in logs.

## Feedback notes (optional)

**Send feedback** turns each note into an issue in a private GitHub repo. Root has no secret storage, so the app doesn't talk to GitHub itself: it posts notes to a small relay on Vercel (`feedback-relay/`), and only the relay holds the GitHub token. The package carries just the relay's address and a shared key (`server/dist/feedback.json`, written by the build). Without them, the feedback box is hidden.

1. Create a **private** repo for the notes, for example `study-squad-feedback`.
2. Create a fine-grained token at GitHub → Settings → Developer settings → **Fine-grained tokens**: **Only select repositories** with that repo, and **Issues: Read and write** as the only permission. Set an expiry and a calendar reminder to renew it.
3. Make a relay key: a long random string, for example from `openssl rand -hex 32`.
4. In the Vercel project for the relay (root directory `feedback-relay`), add environment variables `GITHUB_TOKEN` (the token, marked Sensitive), `GITHUB_REPO` (`owner/name`) and `RELAY_KEY` (the key), then redeploy.
5. In this repo's Actions secrets, add `FEEDBACK_RELAY_URL` (`https://<relay>.vercel.app/api/feedback`) and `FEEDBACK_RELAY_KEY` (the same key). For Docker builds, put the same two lines in `server/.env`.

The relay accepts up to 50 notes a day from all communities together (`DAILY_CAP` changes it). Someone who pulled the key out of a package could only post notes up to that cap; they can't read anything. If that happens, change `RELAY_KEY` on Vercel and in the secrets, and ship a new version.

When the GitHub token expires, the relay answers with an error and notes wait in each community. Put a fresh token in Vercel and they're sent with the next note or server restart. No app release is needed.

## Versions uploaded by hand

If you upload a version yourself, tag it so the job won't try it again:

```sh
git tag root-v0.3.2 <commit> && git push origin root-v0.3.2
```

## Running it again

If an upload failed (say Root was down), open **Actions → CI**, pick the `main` run and choose **Re-run failed jobs**, or start CI on `main` with **Run workflow**.
