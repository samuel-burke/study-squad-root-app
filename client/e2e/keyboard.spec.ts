import { expect, isPhone, test } from "./fixtures";

test.describe("keyboard", () => {
  test.skip(({ page }) => isPhone(page), "Phones have no keyboard");

  test("starts focusing at the main table with only the keyboard", async ({ page }) => {
    await page.goto("/?join=0");
    await expect(page.getByRole("timer")).toBeVisible();
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("f");
    const sheet = page.getByRole("dialog", { name: "What are you working on?" });
    await expect(sheet.getByLabel("Goals for this session")).toBeFocused();
    await page.keyboard.type("Make 20 flashcards");
    await page.keyboard.press("Enter");
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("button", { name: "Leave room timer" })).toBeVisible();
  });

  test("moves around the board grid by row with the arrow keys", async ({ page }) => {
    await page.goto("/?join=0");
    const people = page
      .getByRole("region", { name: "Who is in the room" })
      .getByRole("button", { name: /^View / });
    await expect(people.nth(4)).toBeVisible();
    const first = await people.first().boundingBox();
    await people.first().focus();
    await page.keyboard.press("ArrowDown");
    const below = await page.evaluate(() => document.activeElement!.getBoundingClientRect());
    // Same column, next row.
    expect(below.top).toBeGreaterThan(first!.y + 10);
    expect(Math.abs(below.left - first!.x)).toBeLessThan(10);
  });
});
