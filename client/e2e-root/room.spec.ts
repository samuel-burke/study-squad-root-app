import { expect, test } from "@playwright/test";
import {
  expectNoErrors,
  joinRoomTimer,
  openAs,
  posts,
  runJobs,
  saveSettings,
  state,
  advanceClock,
} from "./fakeRoot";

// The tests share one server and run in order. Settings are saved back to the
// default at the end of the test that changes them.

test("two members see each other join live, and the combo rises for both", async ({ browser }) => {
  const ana = await openAs(browser, "u-ana");
  const ben = await openAs(browser, "u-ben");

  await joinRoomTimer(ana.page, "Read chapter 4");
  const board = ben.page.getByRole("region", { name: "Who is in the room" });
  await expect(board.getByRole("listitem", { name: /^Ana, Room timer/ })).toContainText(
    "Read chapter 4",
  );
  await expect(ben.page.getByRole("heading", { name: /Focusing now · 1/ })).toBeVisible();

  await joinRoomTimer(ben.page, "Problem set 2");
  await expect(
    ana.page.getByRole("region", { name: "Who is in the room" }).getByRole("listitem", {
      name: /^Ben, Room timer/,
    }),
  ).toContainText("Problem set 2");
  await expect(ana.page.getByText("1.2x combo")).toBeVisible();
  await expect(ben.page.getByText("1.2x combo")).toBeVisible();

  await expectNoErrors(ana, ben);
  await ana.close();
  await ben.close();
});

test("a badge unlock reaches only the member who earned it", async ({ browser }) => {
  const cy = await openAs(browser, "u-cy");
  const dee = await openAs(browser, "u-dee");

  await joinRoomTimer(cy.page, "Outline essay");
  const panel = cy.page.getByRole("region", { name: "Your session" });
  await panel.getByRole("checkbox", { name: "Outline essay" }).click();

  const unlock = cy.page.locator(".unlock");
  await expect(unlock).toBeVisible();
  await unlock.getByRole("button", { name: "Nice!" }).click();
  await expect(dee.page.locator(".unlock")).toHaveCount(0);

  await expectNoErrors(cy, dee);
  await cy.close();
  await dee.close();
});

test("App settings saved in Root apply live, in the shapes Root sends", async ({
  browser,
  request,
}) => {
  // Root wraps number settings as { value: n }. 0.3.6 read them as numbers
  // and ignored every change.
  const eli = await openAs(browser, "u-eli");
  const boss = eli.page.getByRole("region", { name: "Weekly boss" });
  const maxHp = async () => {
    const text = (await boss.textContent()) ?? "";
    return Number(/of ([\d,]+) HP left/.exec(text)?.[1]?.replace(/,/g, ""));
  };
  await expect(boss).toContainText(/of [\d,]+ HP left/);
  const atDefault = await maxHp(); // base 10,000 times this boss's strength
  expect(atDefault).toBeGreaterThan(0);

  await saveSettings(request, { room: { postChannel: "ch-study" }, game: { bossBaseHpXp: 2000 } });
  await expect.poll(maxHp).toBe(atDefault / 5);

  await saveSettings(request, { room: { postChannel: "ch-study" } });
  await expect.poll(maxHp).toBe(atDefault);
  await expectNoErrors(eli);
  await eli.close();
});

test("closing the app takes a member out of the room count", async ({ browser, request }) => {
  const fay = await openAs(browser, "u-fay");
  const owner = await openAs(browser, "u-owner");
  await expect.poll(async () => (await state(request)).attached).toContain("u-fay");
  const count = owner.page.getByText(/^\d+ in the room$/);
  const withFay = Number((await count.textContent())?.split(" ")[0]);

  await fay.close();
  await expect(count).toHaveText(`${withFay - 1} in the room`);

  await expectNoErrors(owner);
  await owner.close();
});

test("the self-test panel opens only for the developer, and every check passes", async ({
  browser,
}) => {
  const ana = await openAs(browser, "u-ana");
  await ana.page.getByRole("button", { name: "Room settings" }).click();
  await expect(ana.page.getByRole("heading", { name: "Room settings" })).toBeVisible();
  await expect(ana.page.getByRole("region", { name: "Self-test" })).toHaveCount(0);

  const owner = await openAs(browser, "u-owner");
  await owner.page.getByRole("button", { name: "Room settings" }).click();
  const panel = owner.page.getByRole("region", { name: "Self-test" });
  await panel.getByRole("checkbox", { name: /test post/ }).check();
  await panel.getByRole("button", { name: "Run self-test" }).click();
  const results = panel.getByRole("list", { name: "Self-test results" });
  await expect(results.getByRole("listitem")).toHaveCount(8);
  // The ping comes back from this screen on its own.
  await expect(
    results.getByRole("listitem", { name: "Push to your screen only: pass" }),
  ).toBeVisible();
  for (const name of [
    "Versions match",
    "Settings arrive in the shapes we expect",
    "Database",
    "Channels",
    "Members and presence",
    "What your app sees of Root",
  ]) {
    await expect(results.getByRole("listitem", { name: `${name}: pass` })).toBeVisible();
  }
  await expect(results.getByRole("listitem", { name: "Job scheduler: pending" })).toBeVisible();

  await ana.close();
  await expectNoErrors(owner);
  await owner.close();
});

// From here on the tests move Root's clock forward, so they come last.

const HOUR = 3_600_000;
const RECAP_SETTINGS = {
  room: {
    postChannel: "ch-study",
    timeZone: "UTC",
    recapTime: { hours: 12, minutes: 0, seconds: 0 },
  },
};

test("when a round ends, each member gets their own result", async ({ browser, request }) => {
  // Personal results are pushed to one member's client. On Root,
  // clients.getClient never finds anyone, and the fake copies that, so this
  // fails if the server looks members up that way.
  await saveSettings(request, RECAP_SETTINGS);
  // Start from 10:00 UTC tomorrow, so the round and the 12:00 recap below fall
  // on the same day whatever time the tests run.
  const { now } = await (await request.post("/__fake/clock/advance", { data: { ms: 0 } })).json();
  const tenTomorrow = new Date(now);
  tenTomorrow.setUTCDate(tenTomorrow.getUTCDate() + 1);
  tenTomorrow.setUTCHours(10, 0, 0, 0);
  await advanceClock(request, tenTomorrow.getTime() - now);

  const dee = await openAs(browser, "u-dee");
  const eli = await openAs(browser, "u-eli");
  await joinRoomTimer(dee.page, "Flashcards");
  await joinRoomTimer(eli.page, "Lab report");

  await advanceClock(request, 26 * 60_000);
  for (const m of [dee, eli]) {
    await expect(m.page.getByRole("dialog", { name: /^Nice work/ })).toBeVisible();
  }

  await expectNoErrors(dee, eli);
  await dee.close();
  await eli.close();
});

test("the daily recap posts when Root runs its job, and the job finishes", async ({ request }) => {
  // Root hands jobTime as epoch milliseconds, not a Date. Recaps never posted
  // until PR #98 because the handler called .getTime() and threw.
  const recap = (await state(request)).jobs.find((j) => j.tag === "daily-recap" && !j.done);
  expect(recap, "a recap job is scheduled").toBeDefined();
  const { now } = await (await request.post("/__fake/clock/advance", { data: { ms: 0 } })).json();
  expect(recap!.start - now, "the recap is due later today").toBeLessThan(3 * HOUR);
  const before = (await posts(request)).length;

  await advanceClock(request, recap!.start - now + 1_000);
  await runJobs(request);

  const ran = (await state(request)).jobs.find((j) => j.id === recap!.id);
  expect(ran?.done, "the recap job is marked done").toBe(true);
  expect(ran?.failures ?? 0, "the handler never threw").toBe(0);
  await expect
    .poll(async () => (await posts(request)).slice(before).map((p) => p.channelId))
    .toContain("ch-study");
  // And tomorrow's is booked.
  await expect
    .poll(
      async () =>
        (await state(request)).jobs.find((j) => j.tag === "daily-recap" && !j.done)?.start,
    )
    .toBe(recap!.start + 24 * HOUR);
});

test("the self-test's job check finishes when Root runs the job", async ({ browser, request }) => {
  const owner = await openAs(browser, "u-owner");
  await owner.page.getByRole("button", { name: "Room settings" }).click();
  const panel = owner.page.getByRole("region", { name: "Self-test" });
  await panel.getByRole("button", { name: /^(Run self-test|Run again)$/ }).click();
  const results = panel.getByRole("list", { name: "Self-test results" });
  await expect(results.getByRole("listitem", { name: "Job scheduler: pending" })).toBeVisible();

  await advanceClock(request, 31_000);
  await runJobs(request);
  await expect(results.getByRole("listitem", { name: "Job scheduler: pass" })).toBeVisible();
  await expect(panel).toContainText("all 8 passed");

  await expectNoErrors(owner);
  await owner.close();
});

test("the developer's chat commands answer only the developer", async ({ browser, request }) => {
  const owner = await openAs(browser, "u-owner");
  const say = async (userId: string, content: string) => {
    const res = await request.post("/__fake/messages", {
      data: { channelId: "ch-general", userId, content },
    });
    expect(res.ok()).toBe(true);
  };
  const repliesSince = async (count: number) =>
    (await posts(request)).slice(count).map((p) => p.content);
  const start = (await posts(request)).length;

  await say("u-ana", "!help");
  await say("u-owner", "!help");
  await expect
    .poll(() => repliesSince(start))
    .toEqual([expect.stringMatching(/^🧪 Developer commands/)]);

  // A preview plays on the developer's own screen, and needs no test mode.
  await say("u-owner", "!preview badge night-owl");
  await expect(owner.page.locator(".unlock")).toBeVisible();
  await owner.page.locator(".unlock").getByRole("button", { name: "Nice!" }).click();

  // Real changes wait for Developer test mode.
  let seen = (await posts(request)).length;
  await say("u-owner", "!level me 10");
  await expect.poll(() => repliesSince(seen)).toEqual([expect.stringMatching(/test mode is off/)]);
  await saveSettings(request, { room: { postChannel: "ch-study" }, game: { devTestMode: true } });
  // The server applies saved settings a moment later, so ask until it answers.
  await expect
    .poll(async () => {
      const before = (await posts(request)).length;
      await say("u-owner", "!level me 10");
      await expect.poll(async () => (await posts(request)).length).toBeGreaterThan(before);
      return (await posts(request)).at(-1)?.content;
    })
    .toMatch(/\(level 10\)/);

  // The smoke test from chat, once the last run's cooldown has passed.
  await advanceClock(request, 61_000);
  seen = (await posts(request)).length;
  await say("u-owner", "!smoke");
  await expect
    .poll(() => repliesSince(seen))
    .toEqual([expect.stringMatching(/Smoke test on .*Still waiting on: Job scheduler\./)]);

  await saveSettings(request, { room: { postChannel: "ch-study" } });
  await expectNoErrors(owner);
  await owner.close();
});
