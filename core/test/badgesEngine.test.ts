import { describe, expect, it } from "vitest";
import { DomainError, ErrorCode, EMPTY_STREAK, addDays, badgeById } from "../src";
import { configWith, createHarness, MINUTE, T0 } from "./helpers";

const FOCUS = 25 * MINUTE;
/** Wednesday 2026-10-28 07:00 in New York. */
const SEVEN_AM = Date.UTC(2026, 9, 28, 11, 0, 0);
/** Wednesday 2026-10-28 03:00 in New York. */
const THREE_AM = Date.UTC(2026, 9, 28, 7, 0, 0);
/** XP that puts a member at the start of level 8. */
const LEVEL_8_XP = 2450;

async function expectError(promise: Promise<unknown>, code: ErrorCode) {
  const error = await promise.then(
    () => {
      throw new Error("expected the call to fail");
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

describe("earning badges", () => {
  it("awards first-round badges when a room round ends, pushes them once, and shows them on the card", async () => {
    const { engine, notifier, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await engine.joinRoomTimer("marcus");
    await advance(FOCUS);

    expect(notifier.badgesFor("ana")).toEqual(["first-session", "squad-up"]);
    expect(notifier.badges.filter((b) => b.userId === "ana")).toHaveLength(1);
    const progress = await engine.getProgress("ana");
    expect(progress.badges).toEqual([
      { id: "first-session", earnedAt: T0 + FOCUS },
      { id: "squad-up", earnedAt: T0 + FOCUS },
    ]);
    const card = notifier.lastRoom!.members.find((m) => m.userId === "ana")!;
    expect(card.badges).toEqual(["squad-up"]);
    expect(card.cardStyle).toBe("classic");

    // The next round earns nothing new, so nothing is pushed.
    const pushes = notifier.badges.length;
    await advance(5 * MINUTE + FOCUS);
    expect(notifier.badges.length).toBe(pushes);
  });

  it("gives Early Bird for a solo timer started before 8am", async () => {
    const { engine, notifier, advance } = createHarness(configWith(), SEVEN_AM);
    await engine.startSolo("ana", 30);
    await advance(30 * MINUTE);
    expect(notifier.badgesFor("ana")).toEqual(["first-session", "early-bird"]);
  });

  it("gives nothing for a session cut short, apart from time already banked", async () => {
    const { engine, notifier, advance } = createHarness(configWith(), SEVEN_AM);
    await engine.startSolo("ana", 30);
    await advance(10 * MINUTE);
    await engine.endSolo("ana");
    expect(notifier.badgesFor("ana")).toEqual([]);
  });

  it("gives Marathon for a fourth finished session in a day", async () => {
    const { engine, notifier, advance } = createHarness();
    for (let i = 0; i < 4; i++) {
      await engine.startSolo("ana", 5);
      await advance(5 * MINUTE);
      await engine.endSolo("ana");
    }
    expect(notifier.badgesFor("ana")).toContain("marathon");
  });

  it("gives Speedrun and Checked Off for a goal finished right after adding it", async () => {
    const { engine, notifier, advance } = createHarness();
    const me = await engine.addGoal("ana", "Answer one email");
    await advance(30_000);
    await engine.setGoalDone("ana", me.goals[0]!.id, true);
    expect(notifier.badgesFor("ana")).toEqual(["first-goal", "speedrun"]);
    // Unchecking and checking again can't earn anything new.
    await engine.setGoalDone("ana", me.goals[0]!.id, false);
    await engine.setGoalDone("ana", me.goals[0]!.id, true);
    expect(notifier.badgesFor("ana")).toEqual(["first-goal", "speedrun"]);
  });

  it("puts new badges in the reply and the status push too, in case a push is lost", async () => {
    const { engine, notifier, advance } = createHarness();
    const me = await engine.addGoal("ana", "Answer one email");
    expect(me).not.toHaveProperty("newBadges");
    await advance(30_000);
    const done = await engine.setGoalDone("ana", me.goals[0]!.id, true);
    expect(done.newBadges).toEqual(["first-goal", "speedrun"]);
    expect(notifier.statuses.at(-1)?.me.newBadges).toEqual(["first-goal", "speedrun"]);
    const again = await engine.setGoalDone("ana", me.goals[0]!.id, false);
    expect(again).not.toHaveProperty("newBadges");
  });

  it("gives boss badges to everyone who helped, and Final Blow to whoever finished it", async () => {
    // A 1x boss with 100 HP: each 30-minute solo deals 60 XP of damage.
    const config = configWith({ boss: { enabled: true, name: "Calc II", baseHpXp: 100 } });
    const { engine, notifier, advance } = createHarness(config);
    await engine.startSolo("kai", 30);
    await advance(30 * MINUTE);
    await engine.startSolo("ana", 30);
    await advance(30 * MINUTE);

    expect(notifier.badgesFor("ana")).toEqual(expect.arrayContaining(["first-boss", "final-blow"]));
    expect(notifier.badgesFor("kai")).toContain("first-boss");
    expect(notifier.badgesFor("kai")).not.toContain("final-blow");
    expect(notifier.badgesFor("ana")).not.toContain("one-person-army");
  });

  it("gives One-Person Army for a boss defeated alone", async () => {
    const config = configWith({ boss: { enabled: true, name: "Calc II", baseHpXp: 50 } });
    const { engine, notifier, advance } = createHarness(config);
    await engine.startSolo("ana", 30);
    await advance(30 * MINUTE);
    expect(notifier.badgesFor("ana")).toEqual(
      expect.arrayContaining(["first-boss", "final-blow", "one-person-army"]),
    );
  });

  it("gives Giant Slayer for a 2x boss, using the boss's strength", async () => {
    // "Finals" is a 2x boss, so 25 base HP becomes 50.
    const config = configWith({ boss: { enabled: true, name: "Finals", baseHpXp: 25 } });
    const { engine, notifier, advance } = createHarness(config);
    await engine.startSolo("ana", 30);
    await advance(30 * MINUTE);
    expect(notifier.badgesFor("ana")).toContain("giant-slayer");
  });

  it("gives Comeback to someone whose streak broke and who came back", async () => {
    const config = configWith({ streakFreezesEnabled: false });
    const { engine, notifier, store, advance } = createHarness(config);
    await store.members.save({
      userId: "ana",
      xpTotal: 0,
      streak: { ...EMPTY_STREAK, streak: 6, lastActiveDay: addDays("2026-10-28", -4) },
      goalsPrivate: null,
    });
    await engine.startSolo("ana", 25);
    await advance(25 * MINUTE);
    expect(notifier.badgesFor("ana")).toContain("comeback");
  });

  it("gives level badges when XP crosses the level", async () => {
    const { engine, notifier, store, advance } = createHarness();
    // 10 XP short of level 5 (200 + 250 + 300 + 350 = 1100).
    await store.members.save({
      userId: "ana",
      xpTotal: 1090,
      streak: EMPTY_STREAK,
      goalsPrivate: null,
    });
    await engine.startSolo("ana", 5);
    await advance(5 * MINUTE);
    expect(notifier.badgesFor("ana")).toContain("level-5");
  });
});

describe("delivering every unlock", () => {
  type Harness = ReturnType<typeof createHarness>;

  /**
   * A badge earned in the background (a timer finishing) has no reply to ride
   * on, so it must reach the member on the break result, the status push and
   * the badge push alike: whichever arrives first plays the unlock.
   */
  function expectPushedEveryWay(notifier: Harness["notifier"], userId: string, ids: string[]) {
    expect(notifier.badgesFor(userId)).toEqual(expect.arrayContaining(ids));
    const status = notifier.statuses.filter((s) => s.userId === userId).at(-1);
    expect(status?.me.newBadges).toEqual(expect.arrayContaining(ids));
    const result = notifier.personal.filter((p) => p.userId === userId).at(-1);
    expect(result?.event.me.newBadges).toEqual(expect.arrayContaining(ids));
  }

  /**
   * XP and boss damage now land minute by minute, so a level or a boss
   * defeat can happen mid-timer, with no break result yet. Those unlocks ride
   * on the minute's status push and the badge push.
   */
  function expectPushedLive(notifier: Harness["notifier"], userId: string, ids: string[]) {
    expect(notifier.badgesFor(userId)).toEqual(expect.arrayContaining(ids));
    const carried = notifier.statuses
      .filter((s) => s.userId === userId)
      .flatMap((s) => s.me.newBadges ?? []);
    expect(carried).toEqual(expect.arrayContaining(ids));
  }

  it("when a room round finishes", async () => {
    const { engine, notifier, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await engine.joinRoomTimer("marcus");
    await advance(FOCUS);
    expectPushedEveryWay(notifier, "ana", ["first-session", "squad-up"]);
    expectPushedEveryWay(notifier, "marcus", ["first-session", "squad-up"]);
  });

  it("when a solo timer finishes", async () => {
    const { engine, notifier, advance } = createHarness(configWith(), SEVEN_AM);
    await engine.startSolo("ana", 30);
    await advance(30 * MINUTE);
    expectPushedEveryWay(notifier, "ana", ["first-session", "early-bird"]);
  });

  it("when focus defeats the boss mid-timer", async () => {
    const config = configWith({ boss: { enabled: true, name: "Calc II", baseHpXp: 50 } });
    const { engine, notifier, advance } = createHarness(config);
    await engine.startSolo("ana", 30);
    await advance(30 * MINUTE);
    expectPushedLive(notifier, "ana", ["first-boss", "final-blow", "one-person-army"]);
  });

  it("when focus crosses a level mid-timer, and a finished timer saves a streak", async () => {
    const config = configWith({ streakFreezesEnabled: false });
    const { engine, notifier, store, advance } = createHarness(config);
    await store.members.save({
      userId: "ana",
      xpTotal: 1090,
      streak: { ...EMPTY_STREAK, streak: 6, lastActiveDay: addDays("2026-10-28", -4) },
      goalsPrivate: null,
    });
    await engine.startSolo("ana", 25);
    await advance(25 * MINUTE);
    expectPushedLive(notifier, "ana", ["level-5"]);
    // A streak day only counts once the timer finishes.
    expectPushedEveryWay(notifier, "ana", ["comeback"]);
  });

  it("when ending a solo early finishes an already-due timer", async () => {
    const { engine, notifier, clock } = createHarness();
    await engine.startSolo("ana", 5);
    // The wake-up hasn't run yet, so ending the solo settles it.
    clock.advance(5 * MINUTE);
    const snapshot = await engine.endSolo("ana");
    expect(snapshot.me.newBadges).toEqual(["first-session"]);
    expectPushedEveryWay(notifier, "ana", ["first-session"]);
  });

  it("when a goal is checked off", async () => {
    const { engine, notifier, advance } = createHarness();
    const me = await engine.addGoal("ana", "Answer one email");
    await advance(30_000);
    const reply = await engine.setGoalDone("ana", me.goals[0]!.id, true);
    expect(reply.newBadges).toEqual(["first-goal", "speedrun"]);
    expect(notifier.badgesFor("ana")).toEqual(["first-goal", "speedrun"]);
    expect(notifier.statuses.at(-1)?.me.newBadges).toEqual(["first-goal", "speedrun"]);
  });
});

describe("card looks", () => {
  it("shows the gold border automatically at level 8", async () => {
    const { engine, store } = createHarness();
    await store.members.save({
      userId: "ana",
      xpTotal: LEVEL_8_XP,
      streak: EMPTY_STREAK,
      goalsPrivate: null,
    });
    const snap = await engine.joinRoomTimer("ana");
    expect(snap.room.members[0]!.cardStyle).toBe("gold");
    expect((await engine.getProgress("ana")).card).toEqual({
      chosenStyle: "",
      chosenShowcase: [],
      style: "gold",
      showcase: [],
    });
  });

  it("lets members pick an unlocked style, refuses locked ones, and goes back to automatic", async () => {
    const { engine, store, notifier } = createHarness();
    await store.members.save({
      userId: "ana",
      xpTotal: LEVEL_8_XP,
      streak: EMPTY_STREAK,
      goalsPrivate: null,
    });
    await engine.joinRoomTimer("ana");

    expect((await engine.setCardStyle("ana", "lagoon")).card.style).toBe("lagoon");
    expect(notifier.lastRoom!.members[0]!.cardStyle).toBe("lagoon");
    await expectError(engine.setCardStyle("ana", "legend"), ErrorCode.Validation);
    await expectError(engine.setCardStyle("ana", "midnight"), ErrorCode.Validation);
    await expectError(engine.setCardStyle("ana", "sparkles"), ErrorCode.Validation);
    await expectError(engine.setCardStyle("ana", 7), ErrorCode.Validation);
    const back = await engine.setCardStyle("ana", "");
    expect(back.card).toMatchObject({ chosenStyle: "", style: "gold" });
  });

  it("unlocks badge styles with the badge", async () => {
    const { engine, store } = createHarness();
    await store.badges.award({ userId: "ana", badgeId: "night-owl", earnedAt: T0 });
    expect((await engine.setCardStyle("ana", "midnight")).card.style).toBe("midnight");
  });

  it("lets members pin one earned badge to their card", async () => {
    const { engine, store } = createHarness();
    for (const [i, badgeId] of ["first-session", "leet", "night-owl"].entries()) {
      await store.badges.award({ userId: "ana", badgeId, earnedAt: T0 + i });
    }
    expect((await engine.getProgress("ana")).card.showcase).toEqual(["night-owl"]);
    const pinned = await engine.setBadgeShowcase("ana", ["leet"]);
    expect(pinned.card).toMatchObject({ chosenShowcase: ["leet"], showcase: ["leet"] });
    await expectError(engine.setBadgeShowcase("ana", ["marathon"]), ErrorCode.Validation);
    await expectError(
      engine.setBadgeShowcase("ana", ["first-session", "leet"]),
      ErrorCode.Validation,
    );
    await expectError(engine.setBadgeShowcase("ana", "leet"), ErrorCode.Validation);
    expect((await engine.setBadgeShowcase("ana", [])).card.chosenShowcase).toEqual([]);
  });

  it("erases badges and card looks with the rest of a member's data", async () => {
    const { engine, store } = createHarness();
    await store.badges.award({ userId: "ana", badgeId: "night-owl", earnedAt: T0 });
    await engine.setCardStyle("ana", "midnight");
    await engine.deleteMyData("ana");
    const progress = await engine.getProgress("ana");
    expect(progress.badges).toEqual([]);
    expect(progress.card.style).toBe("classic");
  });
});

describe("leaderboard badges", () => {
  it("awards Podium and Pole Position once enough members are ranked this week", async () => {
    const { engine, store, notifier, advance } = createHarness();
    await store.stats.add("kai", "2026-10-26", { focusMinutes: 50 });
    await store.stats.add("lena", "2026-10-27", { focusMinutes: 40 });
    await engine.startSolo("ana", 60);
    await advance(60 * MINUTE);
    expect(notifier.badgesFor("ana")).toEqual(expect.arrayContaining(["podium", "pole-position"]));
  });

  it("doesn't count a place when too few members are ranked, or when you're hidden", async () => {
    const alone = createHarness();
    await alone.engine.startSolo("ana", 30);
    await alone.advance(30 * MINUTE);
    expect(alone.notifier.badgesFor("ana")).not.toContain("podium");

    const hidden = createHarness();
    await hidden.store.stats.add("kai", "2026-10-26", { focusMinutes: 50 });
    await hidden.store.stats.add("lena", "2026-10-27", { focusMinutes: 40 });
    await hidden.store.stats.add("jordan", "2026-10-27", { focusMinutes: 30 });
    await hidden.engine.setLeaderboardHidden("ana", true);
    await hidden.engine.startSolo("ana", 60);
    await hidden.advance(60 * MINUTE);
    expect(hidden.notifier.badgesFor("ana")).not.toContain("podium");
  });
});

describe("member profiles", () => {
  it("shows another member's level, XP, streak and badges, but not their goals", async () => {
    const { engine, store } = createHarness();
    await store.members.save({
      userId: "ana",
      xpTotal: LEVEL_8_XP + 10,
      streak: EMPTY_STREAK,
      goalsPrivate: true,
    });
    await store.badges.award({ userId: "ana", badgeId: "first-session", earnedAt: T0 });
    await store.badges.award({ userId: "ana", badgeId: "night-owl", earnedAt: T0 + 1 });
    await engine.joinRoomTimer("ana", { goals: ["Secret plans"] });
    await engine.setBadgeShowcase("ana", ["first-session"]);

    const profile = await engine.getMemberProfile("ana");
    expect(profile).toEqual({
      userId: "ana",
      level: 8,
      xpTotal: LEVEL_8_XP + 10,
      xpIntoLevel: 10,
      xpForNextLevel: profile.xpForNextLevel,
      streak: 0,
      badges: [
        { id: "first-session", earnedAt: T0 },
        { id: "night-owl", earnedAt: T0 + 1 },
      ],
      showcase: ["first-session"],
      cardStyle: "gold",
    });
    expect(JSON.stringify(profile)).not.toContain("Secret plans");
  });

  it("reads a member it has never seen as brand new, and refuses junk ids", async () => {
    const { engine } = createHarness();
    expect(await engine.getMemberProfile("nobody")).toMatchObject({
      level: 1,
      xpTotal: 0,
      streak: 0,
      badges: [],
      showcase: [],
      cardStyle: "classic",
    });
    await expectError(engine.getMemberProfile(""), ErrorCode.Validation);
    await expectError(engine.getMemberProfile("a b"), ErrorCode.Validation);
    await expectError(engine.getMemberProfile(42), ErrorCode.Validation);
  });
});

describe("squad bot badge posts", () => {
  const badgePosts = (posts: { kind: string; detail: unknown }[]) =>
    posts
      .map((p) => p.detail as { event?: string; text: string; userIds: string[] })
      .filter((d) => d.event === "badgeUnlocked");

  it("congratulates each member once, naming every badge they just earned", async () => {
    const { engine, announcer, advance } = createHarness();
    await engine.joinRoomTimer("ana");
    await engine.joinRoomTimer("marcus");
    await advance(FOCUS);
    const posts = badgePosts(announcer.posts);
    expect(posts.map((p) => p.userIds)).toEqual([["ana"], ["marcus"]]);
    const names = ["first-session", "squad-up"].map((id) => badgeById(id)!.name);
    expect(posts[0]!.text).toContain(`${names[0]} and ${names[1]}`);
    // Nothing new next round, so no new post.
    await advance(5 * MINUTE + FOCUS);
    expect(badgePosts(announcer.posts)).toHaveLength(2);
  });

  it("keeps secret badges a surprise for everyone else", async () => {
    const { engine, announcer, advance } = createHarness(configWith(), THREE_AM);
    await engine.startSolo("ana", 30);
    await advance(30 * MINUTE);
    const text = badgePosts(announcer.posts)[0]!.text;
    expect(text).toContain("a secret badge");
    expect(text).not.toContain(badgeById("three-am")!.name);
  });

  it("stays quiet when the squad bot is off", async () => {
    const config = configWith({ squadBot: { enabled: false, personalities: ["hype"] } });
    const { engine, announcer, advance } = createHarness(config);
    await engine.startSolo("ana", 30);
    await advance(30 * MINUTE);
    expect(badgePosts(announcer.posts)).toEqual([]);
  });
});
