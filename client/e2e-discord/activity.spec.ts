import { expect, test, type Browser } from "@playwright/test";
import { joinRoomTimer } from "../e2e-root/fakeRoot";

const GUILD = "111111111111111111";
const ANA = "200000000000000002";
const BEN = "200000000000000003";

async function openAs(browser: Browser, userId: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/?devUser=${userId}&devGuild=${GUILD}`);
  await expect(page.getByRole("timer")).toBeVisible();
  return { page, errors, close: () => context.close() };
}

test("two members in one Discord server study together live", async ({ browser }) => {
  const ana = await openAs(browser, ANA);
  const ben = await openAs(browser, BEN);

  await joinRoomTimer(ana.page, "Read chapter 4");
  await expect(
    ben.page.getByRole("region", { name: "Who is in the room" }).getByRole("listitem", {
      name: /^Ana, Room timer/,
    }),
  ).toContainText("Read chapter 4");

  // Discord has no Join voice link for Activities.
  await expect(ana.page.getByRole("button", { name: /Join voice/ })).toHaveCount(0);

  expect([...ana.errors, ...ben.errors]).toEqual([]);
  await ana.close();
  await ben.close();
});

test("opened outside Discord, it shows a message instead of a blank screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 20_000 });
});
