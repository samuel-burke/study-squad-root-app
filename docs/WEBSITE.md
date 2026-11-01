# Website

Study Squad has a small website with a home page and the privacy policy, hosted free on GitHub Pages. It's the link to give Root's app listing as the privacy policy URL.

- Home: `https://studysquad.samuelburke.dev/`
- Privacy policy: `https://studysquad.samuelburke.dev/privacy/`

Until the custom domain is set up, the same pages are at `https://samuel-burke.github.io/study-squad-root-app/`.

## How it works

`PRIVACY.md` is the only copy of the policy. `scripts/build-site.mjs` turns it into a styled page, together with the files in `site/` (the page layout, the home page and the stylesheet), and writes everything to `_site/`. It has no dependencies, so its markdown converter only knows what `PRIVACY.md` uses: headings, paragraphs, bold, italics, links, lists and tables.

The **Website** workflow (`.github/workflows/pages.yml`) publishes it whenever a change to the policy or the site reaches `main`. CI builds it on every pull request too, so a broken page shows up before merging.

To preview locally:

```sh
node scripts/build-site.mjs && open _site/index.html
```

Keep links in `PRIVACY.md` as full URLs (not `SECURITY.md`), so they work both on GitHub and on the website.

## One-time setup

1. In GitHub, open the repo's **Settings → Pages**, and under **Build and deployment** set **Source** to **GitHub Actions**.
2. Run the workflow once: **Actions → Website → Run workflow** on `main`.
3. At your domain's DNS provider, add a record: type `CNAME`, name `studysquad`, value `samuel-burke.github.io`.
4. Back in **Settings → Pages**, type `studysquad.samuelburke.dev` under **Custom domain** and save. Once the DNS check passes, tick **Enforce HTTPS** (the certificate can take up to an hour).
5. Update the privacy policy URL in the Root developer portal to `https://studysquad.samuelburke.dev/privacy/`.
