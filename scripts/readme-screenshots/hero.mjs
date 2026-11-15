// Records the README hero GIF from the demo build: the last seconds of a focus round, the
// badge unlock it earns, and the room switching to the break.
// Run `npm run demo`, then `node scripts/readme-screenshots/hero.mjs` (needs ffmpeg).
// Writes docs/screenshots/hero.gif (or the path given as the first argument).
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const base = process.env.DEMO_URL ?? "http://127.0.0.1:5173/";
const out = resolve(process.argv[2] ?? join(here, "../../docs/screenshots/hero.gif"));
const MIN = 60_000;
const SIZE = { width: 1440, height: 900 };
const QUERY =
  "?streak=11&xp=4210&weekHours=6.5&join=0&badges=first-session,squad-up,study-group,podium,pole-position";

// A plain click can miss while the unlock is still animating, so press the button directly.
const close = (button) => button.evaluate((b) => b.click());

const videoDir = await mkdtemp(join(tmpdir(), "hero-"));
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: SIZE,
  colorScheme: "dark",
  timezoneId: "America/Chicago",
  recordVideo: { dir: videoDir, size: SIZE },
});
const page = await context.newPage();
await page.clock.install({ time: new Date("2026-11-04T18:40:00-06:00") });
await page.goto(base + QUERY);
await page.getByRole("timer").waitFor();
await page.clock.runFor(1500);
await page.getByRole("button", { name: "Join room timer" }).click();
await page.fill("#goal-0", "Calc problem set 6");
await page.getByRole("dialog").getByRole("button", { name: "Start focusing" }).click();
// Skip to 6 seconds before the round ends, closing anything that unlocks on the way.
for (let left = 14.5 * MIN - 6000; left > 0; left -= Math.min(MIN, left)) {
  await page.clock.runFor(Math.min(MIN, left));
  const nice = page.locator(".unlock").getByRole("button", { name: "Nice!" });
  if (await nice.isVisible()) await close(nice);
}
await page.waitForTimeout(500);
const from = Date.now();
await page.clock.resume();
// The round ends and Full House unlocks (the query already owns the round's other badges).
// Close it once its Nice! shows, then hold on the room's break.
const nice = page.locator(".unlock").getByRole("button", { name: "Nice!" });
await nice.waitFor({ timeout: 30_000 });
await page.waitForTimeout(1800);
await close(nice);
await page.waitForTimeout(4500);
const seconds = (Date.now() - from) / 1000;
await context.close();
await browser.close();

const [video] = await readdir(videoDir);
execFileSync("ffmpeg", [
  "-v",
  "error",
  "-y",
  // The recording can run short of wall time, so cut the clip from its end.
  "-sseof",
  `-${seconds.toFixed(2)}`,
  "-i",
  join(videoDir, video),
  "-vf",
  "fps=10,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4",
  out,
]);
console.log(`Hero GIF written to ${out}`);
