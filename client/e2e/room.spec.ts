import { expect, isPhone, openStartSheet, test } from "./fixtures";

test.describe("focus room", () => {
  test("opens mid-round with the room already busy, and the timer counts down", async ({
    page,
  }) => {
    await page.goto("/");
    const timer = page.getByRole("timer");
    await expect(timer).toHaveText(/^1\d:\d\d$/);
    const first = await timer.textContent();
    await expect(timer).not.toHaveText(first ?? "", { timeout: 3_000 });
    await expect(page.getByRole("heading", { name: /Focusing now · 7/ })).toBeVisible();
    await expect(page.getByText("Ana R.")).toBeVisible();
    if (!isPhone(page)) {
      await expect(page.getByRole("region", { name: "Weekly boss" })).toContainText(
        /[\d,]+ of [\d,]+ HP left/,
      );
      await expect(page.getByRole("region", { name: "Combo meter" })).toContainText("1.4x");
    }
  });

  test("links to the voice channel and marks who is in it", async ({ page }) => {
    await page.goto("/");
    const join = page.getByRole("link", { name: "Join voice #Study voice, 2 in there" });
    await expect(join).toHaveAttribute("href", "https://rootapp.com");
    await expect(join).toHaveAttribute("target", "_blank");
    await expect(page.getByRole("listitem", { name: /^Ana R\., .*, in voice$/ })).toBeVisible();
    await expect(page.getByRole("img", { name: "In voice" })).toHaveCount(2);
  });

  test("joining adds your card and raises the combo", async ({ page }) => {
    await page.goto("/");
    const sheet = await openStartSheet(page);
    await expect(sheet.getByRole("radio", { name: /Join the room timer/ })).toContainText(
      "combo goes to 1.5x",
    );
    await sheet.getByLabel("Goals for this session").fill("Make 20 flashcards");
    await sheet.getByRole("button", { name: "Start focusing" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("listitem", { name: /^You, Room timer/ })).toContainText(
      "Make 20 flashcards",
    );
    await expect(page.getByRole("heading", { name: /Focusing now · 8/ })).toBeVisible();
    await expect(page.getByText("1.5x").first()).toBeVisible();
  });

  test("private goals show as Focusing to everyone else", async ({ page }) => {
    await page.goto("/");
    const sheet = await openStartSheet(page);
    await sheet.getByLabel("Goals for this session").fill("Secret plan");
    await sheet.getByRole("switch", { name: "Keep my goals private" }).click();
    await sheet.getByRole("button", { name: "Start focusing" }).click();
    const card = page.getByRole("listitem", { name: /^You, Room timer/ });
    await expect(card).toContainText("Focusing");
    await expect(card).not.toContainText("Secret plan");
  });

  test("a solo timer still shows on the board", async ({ page }) => {
    await page.goto("/");
    const sheet = await openStartSheet(page);
    await sheet.getByRole("radio", { name: /Solo timer/ }).click();
    await sheet.getByRole("radio", { name: "15 min" }).click();
    await sheet.getByRole("button", { name: "Start focusing" }).click();
    await expect(page.getByRole("listitem", { name: /^You, Solo · 1[45]:\d\d/ })).toBeVisible();
  });

  test("can be used with the keyboard alone", async ({ page }) => {
    test.skip(isPhone(page), "keyboard flow is a desktop concern");
    await page.goto("/");
    await page.getByRole("button", { name: "Join room timer" }).focus();
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog", { name: "What are you working on?" });
    await expect(sheet.getByLabel("Goals for this session")).toBeFocused();
    await page.keyboard.type("Keyboard only");
    await page.keyboard.press("Enter");
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("listitem", { name: /^You, Room timer/ })).toContainText(
      "Keyboard only",
    );
  });
});

test.describe("the break moment", () => {
  test("lands for everyone when the round ends, with XP, streak, boss damage and a goal check", async ({
    page,
  }) => {
    await page.goto("/?focus=0.1&break=0.5");
    const sheet = await openStartSheet(page);
    await sheet.getByLabel("Goals for this session").fill("Read ch. 4");
    await sheet.getByRole("button", { name: "Start focusing" }).click();

    const moment = page.getByRole("dialog", { name: "Nice work, everyone" });
    await expect(moment).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("status").filter({ hasText: "Round 1 complete" })).toHaveCount(1);
    // The round also earns a badge, announced in its own banner.
    await expect(page.getByText("Badge unlocked")).toBeVisible();
    await expect(moment).toContainText("6 days");
    await expect(moment).toContainText(/finished together/);
    await expect(moment).toContainText(/hit .+ for/);
    await expect(moment).toContainText("Did you finish Read ch. 4?");
    // The board flips to Break for everyone at the same moment.
    await expect(page.locator(".phase-pill")).toHaveAttribute("data-phase", "break");

    // The demo starts with no badges, so this round's unlocks sit on top of the moment.
    const unlock = page.locator(".unlock");
    while (await unlock.isVisible()) {
      await unlock.getByRole("button", { name: "Nice!" }).click();
    }
    await moment.getByRole("button", { name: "Done, +25 XP" }).click();
    await expect(moment).toBeHidden();
  });
});

test.describe("progress", () => {
  test("shows level, streak, freeze and five weeks of history", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Your progress" }).click();
    await expect(page.getByRole("heading", { name: "Your progress" })).toBeVisible();
    await expect(page.getByText("5 day streak")).toBeVisible();
    await expect(page.getByText("1 freeze left")).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Focus time, last 5 weeks" }).getByRole("listitem"),
    ).toHaveCount(35);
    await expect(
      page.getByRole("region", { name: "Weekly quests" }).getByRole("progressbar"),
    ).toHaveCount(3);
    await page.getByRole("button", { name: "Back to the room" }).click();
    await expect(page.getByRole("timer")).toBeVisible();
  });

  test("shows the weekly leaderboard and lets you hide yourself", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Your progress" }).click();
    const board = page.getByRole("region", { name: "Leaderboard" });
    await expect(board.getByText("Resets Monday")).toBeVisible();
    const minutes = board.getByRole("button", { name: "Minutes" });
    const xp = board.getByRole("button", { name: "XP" });
    await expect(minutes).toHaveAttribute("aria-pressed", "true");
    await expect(board.getByRole("listitem").first()).toHaveAccessibleName(/(min|hrs?)$/);
    await xp.click();
    await expect(xp).toHaveAttribute("aria-pressed", "true");
    await expect(board.getByRole("listitem").first()).toHaveAccessibleName(/\d+ XP$/);
    await board.getByRole("button", { name: "All time" }).click();
    await expect(board.getByRole("heading", { name: "All time" })).toBeVisible();
    await expect(board.getByText("Never resets")).toBeVisible();
    await expect(board.getByRole("listitem").first()).toHaveAccessibleName(/\d+ XP$/);
    const show = board.getByRole("switch", { name: "Show me on the leaderboard" });
    await expect(show).toHaveAttribute("aria-checked", "true");
    await show.click();
    await expect(show).toHaveAttribute("aria-checked", "false");
    await expect(board.getByText("You're hidden.")).toBeVisible();
    await expect(board.getByRole("listitem", { name: /, You,/ })).toHaveCount(0);
  });

  test("shows the badge shelf and card styles", async ({ page }) => {
    await page.goto("/?badges=first-session");
    await page.getByRole("button", { name: "Your progress" }).click();
    const shelf = page.getByRole("region", { name: "Badges" });
    await expect(shelf.getByRole("button", { name: "First Steps, earned" })).toBeVisible();
    await expect(
      shelf.getByRole("button", { name: "Secret badge, not found yet" }).first(),
    ).toBeVisible();
    const styles = page.getByRole("radiogroup", { name: "Card style" });
    await styles.getByRole("radio", { name: /Ember/ }).click();
    await expect(styles.getByRole("radio", { name: /Ember/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

test("tapping a member opens their profile with stats and badges", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("timer")).toBeVisible();
  const open = page.getByRole("button", { name: /^View .+'s profile$/ }).first();
  await open.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("day streak");
  await expect(dialog.getByRole("region", { name: "Badges" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});
