import type { Page } from "@playwright/test";
import { expect, isPhone, openStartSheet, test } from "./fixtures";

/**
 * Game rules end to end, on the demo build with a fake clock so a whole
 * cycle (or a day) passes in moments. The demo's test URL settings
 * (docs/TESTING.md) set up the boss, streak and XP each test starts from.
 */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
/**
 * Every test starts at noon on a Wednesday (UTC, see playwright.config.ts), far
 * from the 4am day and Monday week boundaries, so the time CI runs can't split a test across days.
 */
const START = new Date("2026-10-28T12:00:00Z");

async function open(page: Page, query: string) {
  await page.clock.install({ time: START });
  await page.goto(`/${query}`);
  await expect(page.getByRole("timer")).toBeVisible();
}

async function joinRoom(page: Page) {
  const sheet = await openStartSheet(page);
  await sheet.getByRole("button", { name: "Start focusing" }).click();
  await expect(sheet).toBeHidden();
}

/** Lets fake time pass, firing every timer due on the way. */
async function wait(page: Page, ms: number) {
  await page.clock.runFor(ms);
}

const breakMoment = (page: Page) => page.getByRole("dialog", { name: /^Nice work/ });
const boss = (page: Page) => page.locator("section.boss");
const myCard = (page: Page) => page.getByRole("listitem", { name: /^You, Room timer/ });

/** Closes badge unlocks and the break moment, which sit on top of the room. */
async function clearOverlays(page: Page) {
  for (let i = 0; i < 20; i++) {
    const unlock = page.locator(".unlock");
    if (await unlock.isVisible()) {
      await unlock.getByRole("button", { name: "Nice!" }).click();
    } else if (await breakMoment(page).isVisible()) {
      await page.keyboard.press("Escape");
    } else {
      return;
    }
  }
}

async function expectEarned(page: Page, names: string[]) {
  await clearOverlays(page);
  await page.getByRole("button", { name: "Your progress" }).click();
  const shelf = page.getByRole("region", { name: "Badges" });
  for (const name of names) {
    await expect(shelf.getByRole("button", { name: `${name}, earned` })).toBeVisible();
  }
  await page.getByRole("button", { name: "Back to the room" }).click();
}

async function addAndFinishGoal(page: Page, text: string) {
  await clearOverlays(page);
  const panel = page.getByRole("region", { name: "Your session" });
  await panel.getByRole("button", { name: "Add a goal" }).click();
  await panel.getByLabel("New goal").fill(text);
  await panel.getByRole("button", { name: "Add" }).click();
  await panel.getByRole("checkbox", { name: text }).check();
  await expect(panel.getByRole("checkbox", { name: text })).toBeChecked();
}

test.describe("game rules", () => {
  test.beforeEach(({ page }) => {
    test.skip(isPhone(page), "the rules don't depend on layout, so one run is enough");
    // Fake minutes still take real time to step through, a few seconds each.
    test.slow();
  });

  test.describe("XP and levels", () => {
    test("a room round pays focus XP times the combo, and unlocks Study Group", async ({
      page,
    }) => {
      // Five simulated members are on the room timer, so six finish together: 1.5x.
      await open(page, "?focus=2&break=0.5");
      await joinRoom(page);
      await wait(page, 2 * MINUTE);
      // A whole minute at 2 XP, times 1.5.
      await expect(breakMoment(page)).toContainText("+3 XP");
      await expect(breakMoment(page)).toContainText("× 1.5 combo");
      await expectEarned(page, ["Study Group"]);
    });

    test("goals pay 25 XP each, finish the goals quest and level you up", async ({ page }) => {
      await open(page, "?bots=0");
      await expect(page.getByText("Level 7", { exact: true })).toBeVisible();
      for (let i = 1; i <= 5; i++) await addAndFinishGoal(page, `Goal ${i}`);
      // 2,315 + 5 x 25 = 2,440, and the "Finish 5 goals" quest (when it's
      // one of this week's three) adds 40. Level 8 starts at 2,450.
      await expect(page.getByText(/^Level [78]$/)).toBeVisible();
      await expectEarned(page, ["Speedrun"]);
    });

    test("landing on exactly 777 XP unlocks Jackpot", async ({ page }) => {
      await open(page, "?focus=1&break=0.5&bots=0&xp=775");
      await joinRoom(page);
      await wait(page, MINUTE + SECOND);
      await expect(breakMoment(page)).toContainText("+2 XP");
      await expectEarned(page, ["Jackpot"]);
    });

    test("the daily cap stops XP but not boss damage", async ({ page }) => {
      await open(page, "?focus=1&break=0.5&bots=0&cap=2");
      await joinRoom(page);
      await wait(page, MINUTE + SECOND);
      await expect(breakMoment(page)).toContainText("+2 XP");
      await clearOverlays(page);
      await wait(page, 1.5 * MINUTE);
      await expect(breakMoment(page)).toContainText("+0 XP");
      await expect(breakMoment(page)).toContainText("Daily XP cap reached");
      await expect(breakMoment(page)).toContainText(/hit .+ for 2 XP/);
    });
  });

  test.describe("Keep going?", () => {
    test("shows in the long break, and a tap rolls you into the next cycle", async ({ page }) => {
      await open(page, "?focus=1&break=0.5&bots=0");
      await joinRoom(page);
      const keepGoing = page.getByRole("alertdialog", { name: "Keep going?" });
      // Four 1 minute rounds and three 30 second breaks: nothing interrupts focus.
      await wait(page, 5.5 * MINUTE - 2 * SECOND);
      await expect(keepGoing).toBeHidden();
      await wait(page, 3 * SECOND);
      await clearOverlays(page);
      await expect(keepGoing).toBeVisible();
      await keepGoing.getByRole("button", { name: "Keep going" }).click();
      await expect(keepGoing).toBeHidden();
      // Past the end of the cycle you're still on the room timer.
      await wait(page, 2 * MINUTE);
      await clearOverlays(page);
      await expect(myCard(page)).toBeVisible();
      await expectEarned(page, ["Marathon", "Full Cycle"]);
      // The next cycle's four rounds (ending 12.5 minutes in) make eight sessions today.
      await wait(page, 5 * MINUTE + SECOND);
      await expectEarned(page, ["Unstoppable"]);
    });

    test("without a tap the cycle releases you and you keep what you earned", async ({ page }) => {
      await open(page, "?focus=1&break=0.5&bots=0");
      const xp = page.getByRole("progressbar", { name: "Level 7 progress" });
      const before = Number(await xp.getAttribute("aria-valuenow"));
      await joinRoom(page);
      await wait(page, 7 * MINUTE + SECOND);
      await clearOverlays(page);
      await expect(myCard(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Join room timer" })).toBeVisible();
      // Four rounds at 2 XP, plus any quest those rounds finished.
      expect(Number(await xp.getAttribute("aria-valuenow"))).toBeGreaterThanOrEqual(before + 8);
    });

    test("a solo timer never asks", async ({ page }) => {
      await open(page, "?bots=0");
      const sheet = await openStartSheet(page);
      await sheet.getByRole("radio", { name: /Solo timer/ }).click();
      await sheet.getByRole("radio", { name: "15 min" }).click();
      await sheet.getByRole("button", { name: "Start focusing" }).click();
      await wait(page, 16 * MINUTE);
      await clearOverlays(page);
      await expect(page.getByRole("alertdialog", { name: "Keep going?" })).toHaveCount(0);
    });
  });

  test.describe("the weekly boss", () => {
    const names = [
      { name: "Finals week", strength: "2.0", hp: "2,000" },
      { name: "Midterm", strength: "1.5", hp: "1,500" },
      { name: "Bob", strength: "1.0", hp: "1,000" },
      { name: "Pop quiz", strength: "0.75", hp: "750" },
      { name: "Snack Break Goblin", strength: "0.5", hp: "500" },
    ];
    for (const { name, strength, hp } of names) {
      test(`"${name}" is a ${strength}x boss`, async ({ page }) => {
        await open(page, `?bots=0&bossHp=1000&bossName=${encodeURIComponent(name)}`);
        await expect(boss(page)).toContainText(name);
        await expect(boss(page)).toContainText(`Strength ${strength}×`);
        await expect(boss(page)).toContainText(`${hp} of ${hp} HP left`);
      });
    }

    test("defeating it pays loot and unlocks the boss badges", async ({ page }) => {
      await open(page, "?focus=1&break=0.5&bots=0&bossLeft=2");
      await expect(boss(page)).toHaveAttribute("data-defeated", "false");
      await joinRoom(page);
      await wait(page, MINUTE + SECOND);
      await expect(boss(page)).toHaveAttribute("data-defeated", "true");
      await expect(boss(page)).toContainText("Defeated!");
      await expectEarned(page, ["First Boss", "Final Blow", "One-Person Army"]);
    });

    test("The Final Final Exam is a 2x boss with its own badges", async ({ page }) => {
      await open(
        page,
        `?focus=1&break=0.5&bots=0&bossHp=100&bossLeft=2&bossName=${encodeURIComponent("The Final Final Exam")}`,
      );
      await expect(boss(page)).toContainText("Strength 2.0×");
      await expect(boss(page)).toContainText("2 of 200 HP left");
      await joinRoom(page);
      await wait(page, MINUTE + SECOND);
      await expect(boss(page)).toHaveAttribute("data-defeated", "true");
      await expectEarned(page, ["Giant Slayer", "Survived Finals"]);
    });
  });

  test.describe("streaks", () => {
    test("a round extends the streak, and so does a round the next day", async ({ page }) => {
      await open(page, "?focus=1&break=0.5&bots=0&streak=6");
      await joinRoom(page);
      await wait(page, MINUTE + SECOND);
      await expect(breakMoment(page)).toContainText("7 days");
      await expectEarned(page, ["On a Roll"]);
      await page.getByRole("button", { name: "Leave room timer" }).click();

      await page.clock.fastForward("24:00:00");
      await joinRoom(page);
      await wait(page, MINUTE + SECOND);
      await expect(breakMoment(page)).toContainText("8 days");
    });

    test("the week's freeze covers one missed day", async ({ page }) => {
      await open(page, "?focus=1&break=0.5&bots=0&streak=4&missed=1");
      await joinRoom(page);
      await wait(page, MINUTE + SECOND);
      await expect(breakMoment(page)).toContainText("5 days");
      await expectEarned(page, ["Saved by the Freeze"]);
    });

    test("a broken 30 day streak restarts at 1 with Comeback and Phoenix", async ({ page }) => {
      await open(page, "?focus=1&break=0.5&bots=0&streak=30&missed=3");
      await joinRoom(page);
      await wait(page, MINUTE + SECOND);
      await expect(breakMoment(page)).toContainText("1 day");
      await expectEarned(page, ["Comeback", "Phoenix"]);
    });
  });
});

test.describe("badge unlock preview", () => {
  test("plays one unlock per tier after the first key press", async ({ page }) => {
    await page.goto("/?unlock=all");
    await expect(page.getByRole("timer")).toBeVisible();
    await page.keyboard.press("Shift");
    const unlock = page.locator(".unlock");
    for (const tier of ["bronze", "silver", "gold", "platinum", "secret"]) {
      await expect(unlock).toHaveAttribute("data-tier", tier);
      await unlock.getByRole("button", { name: "Nice!" }).click();
    }
    await expect(unlock).toHaveCount(0);
  });
});
