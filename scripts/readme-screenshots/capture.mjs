// Captures the README screenshots from the demo build, in dark and light.
// Run `npm run demo`, then `node scripts/readme-screenshots/capture.mjs`.
// Writes to docs/screenshots/ (or the folder given as the first argument).
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const base = process.env.DEMO_URL ?? "http://127.0.0.1:5173/";
const out = resolve(process.argv[2] ?? join(here, "../../docs/screenshots"));
const MIN = 60_000;
const BADGES =
  "streak-3,streak-7,level-5,level-10,focus-10h,first-session,squad-up,full-cycle,study-group,first-goal,goals-25,productive-day,first-boss,quest-first,podium,marathon";
const QUERY = `?badges=${BADGES}&streak=11&xp=4210&weekHours=3.4`;
const START = new Date("2026-11-04T18:40:00-06:00");
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

async function newPage(browser, viewport, colorScheme) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    colorScheme,
    timezoneId: "America/Chicago",
    hasTouch: viewport === PHONE,
    isMobile: viewport === PHONE,
  });
  const page = await context.newPage();
  await page.clock.install({ time: START });
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

async function settle(page) {
  await page.clock.runFor(1200);
  await page.waitForTimeout(900);
}

async function run(page, ms) {
  for (let t = 0; t < ms; t += MIN) {
    await page.clock.runFor(Math.min(MIN, ms - t));
    await clearUnlocks(page);
  }
}

/** One pass through the app: join, break moment, round 2, goals, settings, progress. */
async function capture(browser, viewport, theme, shots) {
  const suffix = `${viewport === PHONE ? "mobile" : "desktop"}${theme === "light" ? "-light" : ""}`;
  const want = (name) => shots.includes(name);
  const shot = (name) => page.screenshot({ path: join(out, `${name}-${suffix}.png`) });
  const page = await newPage(browser, viewport, theme);
  await page.goto(base + QUERY);
  await page.getByRole("timer").waitFor();
  await page.clock.runFor(1500);
  const phone = viewport === PHONE;
  // Phones open the session sheet from the bottom bar; desktop has a join button.
  if (phone) await page.getByRole("button", { name: "Start focusing" }).click();
  else await page.getByRole("button", { name: "Join room timer" }).click();
  await page.fill("#goal-0", "Calc problem set 6");
  await page.locator("#goal-1").fill("Review lecture 9 slides");
  await settle(page);
  if (want("start-session")) await shot("start-session");
  await page.getByRole("dialog").getByRole("button", { name: "Start focusing" }).click();
  await page.clock.runFor(3000);
  await clearUnlocks(page);
  await run(page, 14.5 * MIN - 5000);
  await page.clock.runFor(4000);
  await page.waitForTimeout(1500);
  if (want("break-moment")) await shot("break-moment");
  await page.getByRole("button", { name: /Done, \+25/ }).click();
  await page.clock.runFor(1500);
  await clearUnlocks(page);
  await page.keyboard.press("Escape");
  await page.clock.runFor(1000);
  await clearUnlocks(page);
  await run(page, 15 * MIN + 17_000);
  await page.waitForTimeout(800);
  if (want("room")) await shot("room");
  if (want("goals")) {
    if (phone) await page.getByRole("button", { name: /^Goals ·/ }).click();
    await settle(page);
    await page.getByRole("button", { name: /^Finished \(/ }).click();
    await settle(page);
    await shot("goals");
    if (phone) await page.keyboard.press("Escape");
    await settle(page);
  }
  if (want("settings")) {
    await page.getByRole("button", { name: "Room settings" }).click();
    await settle(page);
    // Show the admin voice dropdown with a channel picked.
    const voice = page.getByRole("combobox", { name: "Voice channel" });
    if (await voice.isVisible()) {
      const options = await voice.locator("option").allTextContents();
      const pick = options.find((o) => /voice/i.test(o) && !/no voice/i.test(o));
      if (pick) await voice.selectOption({ label: pick });
      await settle(page);
    }
    await shot("settings");
    await page.keyboard.press("Escape");
    await settle(page);
  }
  if (want("progress")) {
    await page.getByRole("button", { name: "Your progress" }).click();
    await settle(page);
    await shot("progress");
  }
  await page.context().close();
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  await capture(browser, DESKTOP, "dark", ["room"]);
  await capture(browser, DESKTOP, "light", ["room", "progress"]);
  await capture(browser, PHONE, "dark", [
    "start-session",
    "break-moment",
    "room",
    "goals",
    "settings",
  ]);
  await capture(browser, PHONE, "light", ["room", "break-moment", "progress"]);
} finally {
  await browser.close();
}
console.log(`README screenshots written to ${out}`);
