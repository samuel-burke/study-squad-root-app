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

**Send feedback** turns each note into an issue in a private GitHub repo. Root has no secret storage, so the build bakes the destination into `server/dist/feedback.json` inside the package. Without it, the feedback box is hidden.

1. Create a **private** repo for the notes, for example `study-squad-feedback`.
2. Create a fine-grained token at GitHub → Settings → Developer settings → **Fine-grained tokens**. Under Repository access, pick **Only select repositories** and choose that repo. Under Permissions, give **Issues: Read and write** and nothing else. Set an expiry and put a reminder in your calendar to renew it.
3. Add two repository secrets, the same way as `ROOT_AUTH_TOKEN`: `FEEDBACK_GITHUB_TOKEN` (the token) and `FEEDBACK_GITHUB_REPO` (`owner/name`, like `samuel-burke/study-squad-feedback`).

The next deploy carries them. To build by hand instead, put the same two lines in `server/.env`. The token can only open issues in that one repo, so even if someone pulled it out of a package, the worst they could do is file issues there. If that happens, revoke the token, make a new one and ship a new version.

When the token expires, notes queue up in each community and are sent once a version with a fresh token is deployed.

## Versions uploaded by hand

If you upload a version yourself, tag it so the job won't try it again:

```sh
git tag root-v0.3.2 <commit> && git push origin root-v0.3.2
```

## Running it again

If an upload failed (say Root was down), open **Actions → CI**, pick the `main` run and choose **Re-run failed jobs**, or start CI on `main` with **Run workflow**.
