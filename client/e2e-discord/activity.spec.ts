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

const OWNER = "200000000000000001";

test("the server owner edits server settings in the Activity; members don't see them", async ({
  browser,
}) => {
  const ana = await openAs(browser, ANA);
  await ana.page.getByRole("button", { name: "Room settings" }).click();
  await expect(ana.page.getByText("People with Manage Server can change these.")).toBeVisible();
  await expect(ana.page.getByRole("button", { name: "Server settings" })).toHaveCount(0);

  const owner = await openAs(browser, OWNER);
  await owner.page.getByRole("button", { name: "Room settings" }).click();
  await owner.page.getByRole("button", { name: "Server settings" }).click();
  const sheet = owner.page.getByRole("dialog");
  await expect(sheet.getByText("Only people with Manage Server can see this")).toBeVisible();
  await sheet
    .getByRole("combobox", { name: "Bot messages channel" })
    .selectOption({ label: "#study" });
  await sheet.getByRole("tab", { name: "Game layer" }).click();
  await sheet.getByRole("switch", { name: "Weekly boss" }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByRole("status")).toHaveText(/Saved/);

  // Everyone gets the new settings live: the boss card is gone for Ana.
  await ana.page.keyboard.press("Escape");
  await expect(ana.page.getByText("Weekly boss", { exact: false })).toHaveCount(0);

  // Put the boss back for the other tests.
  await sheet.getByRole("switch", { name: "Weekly boss" }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByRole("status")).toHaveText(/Saved/);
  await ana.close();
  await owner.close();
});

test("Discord's picture-in-picture window shows the timer mini view", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 400, height: 225 } });
  const page = await context.newPage();
  await page.goto(`/?devUser=${BEN}&devGuild=${GUILD}`);
  const mini = page.getByRole("main", { name: "Study Squad timer" });
  await expect(mini.getByRole("timer")).toBeVisible();
  await expect(mini).toContainText(/studying/);
  await expect(mini.getByRole("progressbar", { name: "Boss HP left" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join room timer" })).toHaveCount(0);
  await context.close();
});

test("a dropped connection shows Reconnecting… and comes back on its own", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Sits between the app and the host, so the test can cut the line.
  const sockets: { close(options?: { code?: number }): Promise<void> }[] = [];
  await page.routeWebSocket("**/ws", (ws) => {
    ws.connectToServer();
    sockets.push(ws);
  });
  await page.goto(`/?devUser=${ANA}&devGuild=${GUILD}`);
  await expect(page.getByRole("timer")).toBeVisible();

  await sockets[0]!.close({ code: 4000 });
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-connection", "lost");
  await expect(root).not.toHaveAttribute("data-connection", "lost", { timeout: 10_000 });
  expect(sockets.length).toBe(2);
  await expect(page.getByRole("timer")).toBeVisible();
  await context.close();
});
