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

## Versions uploaded by hand

If you upload a version yourself, tag it so the job won't try it again:

```sh
git tag root-v0.3.2 <commit> && git push origin root-v0.3.2
```

## Running it again

If an upload failed (say Root was down), open **Actions → CI**, pick the `main` run and choose **Re-run failed jobs**, or start CI on `main` with **Run workflow**.
