// Builds the public website (GitHub Pages) into _site/.
//
//   node scripts/build-site.mjs [outDir]
//
// PRIVACY.md stays the single source of truth: this turns it into a styled
// page at /privacy/, next to a small home page. There are no dependencies, so
// the markdown converter only handles what PRIVACY.md uses: headings,
// paragraphs, bold, italics, links, nested lists, numbered lists and tables.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, process.argv[2] ?? "_site");
const site = join(root, "site");

const escapeHtml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function inline(text) {
  const links = [];
  let html = escapeHtml(text).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    links.push(`<a href="${href}">${label}</a>`);
    return `\uE000${links.length - 1}\uE000`;
  });
  html = html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\w])_(.+?)_(?=[^\w]|$)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  return html.replace(/\uE000(\d+)\uE000/g, (_, i) => inlineLink(links[Number(i)]));
}

// Link labels can hold bold text too.
const inlineLink = (a) => a.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replace(/ +/g, "-");

export function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let title = "";
  let i = 0;

  const listItem = /^(\s*)([-*]|\d+\.) (.*)$/;

  function parseList(indent) {
    const ordered = /^\d+\./.test(listItem.exec(lines[i])[2]);
    const items = [];
    while (i < lines.length) {
      const m = listItem.exec(lines[i]);
      if (!m || m[1].length < indent) break;
      if (m[1].length > indent) {
        items[items.length - 1] += parseList(m[1].length);
        continue;
      }
      items.push(inline(m[3]));
      i++;
    }
    const tag = ordered ? "ol" : "ul";
    return `<${tag}>${items.map((item) => `<li>${item}</li>`).join("")}</${tag}>`;
  }

  while (i < lines.length) {
    const line = lines[i];
    const heading = /^(#{1,3}) (.*)$/.exec(line);
    if (!line.trim()) {
      i++;
    } else if (heading) {
      const level = heading[1].length;
      if (level === 1 && !title) title = heading[2];
      else html.push(`<h${level} id="${slug(heading[2])}">${inline(heading[2])}</h${level}>`);
      i++;
    } else if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const cells = (row) =>
        row
          .slice(1, -1)
          .split("|")
          .map((cell) => inline(cell.trim()));
      const [head, , ...body] = rows;
      html.push(
        `<div class="table"><table><thead><tr>${cells(head)
          .map((c) => `<th>${c}</th>`)
          .join("")}</tr></thead><tbody>${body
          .map(
            (row) =>
              `<tr>${cells(row)
                .map((c) => `<td>${c}</td>`)
                .join("")}</tr>`,
          )
          .join("")}</tbody></table></div>`,
      );
    } else if (listItem.test(line)) {
      html.push(parseList(listItem.exec(line)[1].length));
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#|\||\s*([-*]|\d+\.) )/.test(lines[i])) {
        para.push(lines[i++].trim());
      }
      html.push(`<p>${inline(para.join(" "))}</p>`);
    }
  }
  return { title, body: html.join("\n") };
}

function render(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`site template uses unknown {{${key}}}`);
    return values[key];
  });
}

function build() {
  const layout = readFileSync(join(site, "layout.html"), "utf8");
  const privacy = markdownToHtml(readFileSync(join(root, "PRIVACY.md"), "utf8"));
  const effective = /<p><em>(Effective [^<]+)<\/em><\/p>\n?/;
  const date = effective.exec(privacy.body)?.[1] ?? "";
  const pages = {
    "index.html": {
      title: "Study Squad",
      description: "A group study timer for Root communities.",
      root: "./",
      content: readFileSync(join(site, "home.html"), "utf8"),
    },
    "privacy/index.html": {
      title: `Privacy policy · Study Squad`,
      description: "What Study Squad keeps, why, who sees it, and how to delete it.",
      root: "../",
      content: `<article class="doc">
<p class="eyebrow">Study Squad</p>
<h1>Privacy policy</h1>
<p class="meta">${date}</p>
${privacy.body.replace(effective, "")}
</article>`,
    },
  };

  rmSync(out, { recursive: true, force: true });
  for (const [path, page] of Object.entries(pages)) {
    mkdirSync(dirname(join(out, path)), { recursive: true });
    writeFileSync(join(out, path), render(layout, page));
  }
  mkdirSync(join(out, "assets"), { recursive: true });
  copyFileSync(join(site, "site.css"), join(out, "assets/site.css"));
  copyFileSync(join(root, "scripts/store-screenshots/logo.svg"), join(out, "assets/logo.svg"));
  for (const font of ["dm-sans-latin.woff2", "space-grotesk-latin.woff2"]) {
    copyFileSync(join(root, "client/src/assets/fonts", font), join(out, "assets", font));
  }
  // Plain static files: skip Jekyll on GitHub Pages.
  writeFileSync(join(out, ".nojekyll"), "");
  console.log(`site built in ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
