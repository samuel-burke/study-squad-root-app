// Captures the app screens for the store screenshots from the demo build,
// then renders the captioned 1920x1080 frames. See README.md in this folder.
import { chromium } from "playwright";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const base = process.env.DEMO_URL ?? "http://127.0.0.1:5173/";
const raw = join(here, "raw");
const out = resolve(process.argv[2] ?? join(here, "out"));
const MIN = 60_000;
const BADGES = [
  "streak-3",
  "streak-7",
  "streak-14",
  "level-5",
  "level-10",
  "focus-10h",
  "focus-50h",
  "first-session",
  "early-bird",
  "night-owl",
  "squad-up",
  "room-25",
  "full-cycle",
  "study-group",
  "first-goal",
  "goals-25",
  "productive-day",
  "first-boss",
  "boss-5",
  "quest-first",
  "quest-sweep",
  "podium",
  "marathon",
  "speedrun",
  "weekend-warrior",
].join(",");
// A Sunday evening: 24 day streak after today, level 16, second on the weekly board.
const QUERY = `?badges=${BADGES}&streak=23&xp=8420&weekHours=3.4`;
const START = new Date("2026-11-01T18:40:00-06:00");

async function newPage(browser, fakeClock = true) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    timezoneId: "America/Chicago",
  });
  const page = await context.newPage();
  if (fakeClock) await page.clock.install({ time: START });
  return page;
}

async function clearUnlocks(page) {
  for (let i = 0; i < 20; i++) {
    const unlock = page.locator(".unlock");
    if (!(await unlock.isVisible())) return;
    await unlock.getByRole("button", { name: "Nice!" }).click();
    await page.clock.runFor(800);
  }
}

/** Fake time for the app, real time for CSS transitions. */
async function settle(page) {
  await page.clock.runFor(1200);
  await page.waitForTimeout(900);
}

async function captureApp(browser) {
  const shot = (name) => join(raw, `${name}.png`);
  const page = await newPage(browser);
  await page.goto(base + QUERY);
  await page.getByRole("timer").waitFor();
  await page.clock.runFor(1500);
  await page.getByRole("button", { name: "Join room timer" }).click();
  await page.fill("#goal-0", "Calc problem set 6");
  await page.locator("#goal-1").fill("Review lecture 9 slides");
  await page.getByRole("button", { name: "Start focusing" }).click();
  await page.clock.runFor(3000);
  await clearUnlocks(page);
  // The room opened 10.5 minutes into round 1, so this lands on the break moment.
  await page.clock.runFor(14.5 * MIN - 5000);
  await clearUnlocks(page);
  await page.clock.runFor(4000);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: shot("break") });
  await page.getByRole("button", { name: /Done, \+25/ }).click();
  await page.clock.runFor(1500);
  await clearUnlocks(page);
  await page.keyboard.press("Escape");
  await page.clock.runFor(1000);
  await clearUnlocks(page);
  // Into round 2, about 15 minutes left.
  for (let i = 0; i < 15; i++) {
    await page.clock.runFor(MIN);
    await clearUnlocks(page);
  }
  await page.clock.runFor(17_000);
  await clearUnlocks(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: shot("room") });
  await page.locator("section.boss").screenshot({ path: shot("boss") });
  await page.getByRole("button", { name: "View Ana R.'s profile" }).click();
  await settle(page);
  await page.screenshot({ path: shot("profile") });
  await page.screenshot({
    path: shot("profile-sheet"),
    clip: { x: 483, y: 120, width: 475, height: 582 },
  });
  await page.keyboard.press("Escape");
  await settle(page);
  await page.getByRole("button", { name: "Room settings" }).click();
  await settle(page);
  await page.screenshot({ path: shot("settings") });
  await page.screenshot({
    path: shot("settings-sheet"),
    clip: { x: 483, y: 217, width: 475, height: 328 },
  });
  await page.keyboard.press("Escape");
  await settle(page);
  await page.getByRole("button", { name: "Your progress" }).click();
  await settle(page);
  for (const [name, label] of [
    ["streak", "Streak"],
    ["quests", "Weekly quests"],
    ["badges", "Badges"],
    ["leaderboard", "Leaderboard"],
  ])
    await page.locator(`section[aria-label="${label}"]`).screenshot({ path: shot(name) });
  await page.context().close();

  // The unlock animation runs on real timers, so this page keeps the real clock.
  const unlock = await newPage(browser, false);
  await unlock.goto(base + QUERY + "&unlock=giant-slayer");
  await unlock.getByRole("timer").waitFor();
  await unlock.waitForTimeout(1000);
  await unlock.mouse.click(1300, 880);
  await unlock.waitForTimeout(3500);
  await unlock.screenshot({ path: shot("unlock") });
  await unlock.screenshot({
    path: shot("medal"),
    clip: { x: 595, y: 202, width: 250, height: 250 },
  });
  await unlock.context().close();
}

const FRAMES = [
  ["hero", "00-hero"],
  ["s1-room", "01-study-together"],
  ["s2-break", "02-team-win"],
  ["s3-badges", "03-medals"],
  ["s4-streaks", "04-streaks-quests"],
  ["s5-leaderboard", "05-leaderboard"],
  ["s6-admins", "06-admin-settings"],
];

async function renderFrames(browser) {
  const fonts = join(here, "../../client/src/assets/fonts");
  for (const font of ["dm-sans-latin.woff2", "space-grotesk-latin.woff2"])
    await copyFile(join(fonts, font), join(raw, font));
  await copyFile(join(here, "frames.html"), join(raw, "frames.html"));
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const [id, file] of FRAMES) {
    await page.goto(`file://${join(raw, "frames.html")}#${id}`);
    await page.reload();
    await page.evaluate(() => globalThis.document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, `${file}.png`) });
  }
  await page.close();
}

await mkdir(raw, { recursive: true });
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  await captureApp(browser);
  await renderFrames(browser);
} finally {
  await browser.close();
}
console.log(`Store screenshots written to ${out}`);
