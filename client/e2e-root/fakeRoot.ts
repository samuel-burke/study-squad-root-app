import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";

/** A member with Study Squad open in their own browser (their own Root device). */
export interface Member {
  page: Page;
  errors: string[];
  close(): Promise<void>;
}

/**
 * Opens the app as one of the fake community's members: u-owner, u-ana,
 * u-ben, u-cy, u-dee, u-eli, u-fay. Page errors are collected so a test can
 * fail on silent breakage.
 */
export async function openAs(browser: Browser, userId: string): Promise<Member> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`/?user=${userId}`);
  await expect(page.getByRole("timer")).toBeVisible();
  return { page, errors, close: () => context.close() };
}

export async function expectNoErrors(...members: Member[]) {
  for (const m of members) expect(m.errors, "page errors").toEqual([]);
}

/** Root's channel post log, newest last. */
export async function posts(request: APIRequestContext) {
  const res = await request.get("/__fake/posts");
  return (await res.json()) as { channelId: string; content: string; at: number }[];
}

export async function state(request: APIRequestContext) {
  const res = await request.get("/__fake/state");
  return (await res.json()) as {
    attached: string[];
    jobs: { id: number; tag: string; start: number; done: boolean; failures?: number }[];
  };
}

/** Saves App settings, as plain values; the host delivers them in Root's shapes. */
export async function saveSettings(request: APIRequestContext, settings: Record<string, unknown>) {
  const res = await request.post("/__fake/settings", { data: settings });
  expect(res.ok()).toBe(true);
}

/** Has Root's job scheduler run every job due now. */
export async function runJobs(request: APIRequestContext) {
  const res = await request.post("/__fake/jobs/run", { data: {} });
  expect(res.ok()).toBe(true);
}

/** Joins the room timer with a goal, the way a member would on desktop. */
export async function joinRoomTimer(page: Page, goal: string) {
  await page.getByRole("button", { name: "Join room timer" }).click();
  const sheet = page.getByRole("dialog", { name: "What are you working on?" });
  await sheet.getByLabel("Goals for this session").fill(goal);
  await sheet.getByRole("button", { name: "Start focusing" }).click();
  await expect(sheet).toBeHidden();
}

/** Moves Root's clock forward; the server catches up and pushes what changed. */
export async function advanceClock(request: APIRequestContext, ms: number) {
  const res = await request.post("/__fake/clock/advance", { data: { ms } });
  expect(res.ok()).toBe(true);
}
