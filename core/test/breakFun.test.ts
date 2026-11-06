import { describe, expect, it } from "vitest";
import {
  BREAK_CHALLENGES,
  pickBreakChallenge,
  breakRecapLines,
  ErrorCode,
  DomainError,
  soloBreakKey,
  squadPost,
  type BreakRecapDto,
} from "../src";
import { configWith, createHarness, MINUTE, seededRandom } from "./helpers";

const FOCUS = 25 * MINUTE;
const NO_BOSS = configWith({ boss: { enabled: false, baseHpXp: 10_000 } });

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

/** Ana and Kai on the room timer, at the start of the first break. */
async function onBreakTogether() {
  const harness = createHarness(NO_BOSS);
  await harness.engine.joinRoomTimer("ana");
  await harness.engine.joinRoomTimer("kai");
  await harness.advance(FOCUS + MINUTE);
  return harness;
}

describe("break challenges", () => {
  it("never repeats the last challenge, and spreads them out", () => {
    let last: string | undefined;
    const seen = new Set<string>();
    const random = seededRandom(7);
    for (let i = 0; i < 200; i++) {
      const next = pickBreakChallenge(last, random);
      expect(next.id).not.toBe(last);
      seen.add(next.id);
      last = next.id;
    }
    expect(seen.size).toBe(BREAK_CHALLENGES.length);
    // Even a random() that always lands on the last one's slot moves on.
    expect(pickBreakChallenge(BREAK_CHALLENGES[0]!.id, () => 0).id).not.toBe(
      BREAK_CHALLENGES[0]!.id,
    );
    expect(new Set(BREAK_CHALLENGES.map((c) => c.id)).size).toBe(BREAK_CHALLENGES.length);
    // Plain words only: no emoji in any challenge.
    for (const c of BREAK_CHALLENGES) expect(c.text).toMatch(/^[\x20-\x7e]+$/);
  });

  it("gives everyone on the room break the same challenge, and a new one each break", async () => {
    const { engine, advance } = createHarness(NO_BOSS);
    await engine.joinRoomTimer("ana");
    await engine.joinRoomTimer("kai");
    expect((await engine.getSnapshot("ana")).room.members[0]?.challenge).toBe("");
    const picks: string[] = [];
    for (let round = 0; round < 3; round++) {
      await advance(round === 0 ? FOCUS + MINUTE : 30 * MINUTE);
      const { members } = (await engine.getSnapshot("ana")).room;
      expect(members[0]?.challenge).not.toBe("");
      expect(members[1]?.challenge).toBe(members[0]?.challenge);
      // Asking again in the same break gives the same one.
      expect((await engine.getSnapshot("kai")).room.members[0]?.challenge).toBe(
        members[0]?.challenge,
      );
      picks.push(members[0]!.challenge);
    }
    expect(picks[1]).not.toBe(picks[0]);
    expect(picks[2]).not.toBe(picks[1]);
  });

  it("ticks a member's card once they're done, and never gives XP", async () => {
    const { engine } = await onBreakTogether();
    const before = await engine.getSnapshot("ana");
    const snapshot = await engine.completeBreakChallenge("ana");
    const ana = snapshot.room.members.find((m) => m.userId === "ana");
    const kai = snapshot.room.members.find((m) => m.userId === "kai");
    expect(ana?.challengeDone).toBe(true);
    expect(kai?.challengeDone).toBe(false);
    expect(snapshot.me.xpTotal).toBe(before.me.xpTotal);
    // Tapping again changes nothing.
    await engine.completeBreakChallenge("ana");
    expect((await engine.getSnapshot("ana")).me.xpTotal).toBe(before.me.xpTotal);
  });

  it("is only open on a break, and starts fresh on the next one", async () => {
    const { engine, advance } = createHarness(NO_BOSS);
    await engine.joinRoomTimer("ana");
    await expectError(engine.completeBreakChallenge("ana"), ErrorCode.Conflict);
    await advance(FOCUS + MINUTE);
    await engine.completeBreakChallenge("ana");
    await advance(30 * MINUTE);
    const next = await engine.getSnapshot("ana");
    expect(next.room.timer.phase).toBe("break");
    expect(next.room.members[0]?.challengeDone).toBe(false);
  });

  it("works on a solo break too", async () => {
    const { engine, advance } = createHarness(NO_BOSS);
    await engine.startSolo("ana", 25);
    await advance(FOCUS + MINUTE);
    const snapshot = await engine.completeBreakChallenge("ana");
    expect(snapshot.room.members[0]).toMatchObject({ status: "soloBreak", challengeDone: true });
    expect(soloBreakKey("ana", snapshot.me.endsAt)).toMatch(/^solo:ana:/);
  });
});

describe("high-fives", () => {
  it("counts on the receiver's card and pushes only to them", async () => {
    const { engine, notifier } = await onBreakTogether();
    const snapshot = await engine.sendHighFive("ana", "kai", "🔥");
    expect(snapshot.room.members.find((m) => m.userId === "kai")?.highFives).toBe(1);
    expect(notifier.highFives).toEqual([
      { toUserId: "kai", event: { fromUserId: "ana", emoji: "🔥" } },
    ]);
  });

  it("counts every high-five, 👋 and 🔥 alike, with no cap per teammate", async () => {
    const { engine, notifier } = await onBreakTogether();
    for (let i = 0; i < 8; i++) await engine.sendHighFive("ana", "kai", i % 2 ? "🔥" : "👋");
    await engine.sendHighFive("kai", "ana", "🔥");
    const room = (await engine.getSnapshot("kai")).room;
    expect(room.members.find((m) => m.userId === "kai")?.highFives).toBe(8);
    expect(room.members.find((m) => m.userId === "ana")?.highFives).toBe(1);
    const toKai = notifier.highFives.filter((h) => h.toUserId === "kai").map((h) => h.event.emoji);
    expect(toKai).toEqual(["👋", "🔥", "👋", "🔥", "👋", "🔥", "👋", "🔥"]);
  });

  it("never interrupts someone focusing, and needs you on a break", async () => {
    const { engine, advance } = createHarness(NO_BOSS);
    await engine.joinRoomTimer("ana");
    await engine.startSolo("kai", 50);
    await expectError(engine.sendHighFive("ana", "kai", "👋"), ErrorCode.Conflict);
    await advance(FOCUS + MINUTE);
    // Ana is on a break now, but Kai is still focusing solo.
    await expectError(engine.sendHighFive("ana", "kai", "👋"), ErrorCode.Conflict);
    await expectError(engine.sendHighFive("kai", "ana", "👋"), ErrorCode.Conflict);
  });

  it("rejects odd input", async () => {
    const { engine } = await onBreakTogether();
    await expectError(engine.sendHighFive("ana", "ana", "👋"), ErrorCode.Validation);
    await expectError(engine.sendHighFive("ana", "kai", "💩"), ErrorCode.Validation);
    await expectError(engine.sendHighFive("ana", "", "👋"), ErrorCode.Validation);
  });
});

describe("break recap", () => {
  type SquadDetail = { event: string; recap?: BreakRecapDto };

  it("sums up the break in the back-to-study post", async () => {
    const { engine, announcer, advance } = await onBreakTogether();
    await engine.joinRoomTimer("lena");
    await engine.completeBreakChallenge("ana");
    await engine.completeBreakChallenge("kai");
    await engine.sendHighFive("ana", "kai", "👋");
    await engine.sendHighFive("lena", "kai", "🔥");
    await engine.sendHighFive("kai", "ana", "👋");
    await advance(5 * MINUTE);
    const resumed = announcer.posts
      .map((p) => p.detail as SquadDetail)
      .filter((d) => d.event === "studyResumed");
    expect(resumed).toHaveLength(1);
    const recap = resumed[0]!.recap!;
    expect(recap.challengeDone).toBe(2);
    expect(recap.highFives).toEqual([
      { userId: "kai", count: 2 },
      { userId: "ana", count: 1 },
    ]);
    expect(BREAK_CHALLENGES.map((c) => c.text)).toContain(recap.challenge);
  });

  it("adds nothing when nobody joined in", async () => {
    const { announcer, advance } = await onBreakTogether();
    await advance(5 * MINUTE);
    const resumed = announcer.posts
      .map((p) => p.detail as SquadDetail)
      .find((d) => d.event === "studyResumed");
    expect(resumed).toBeDefined();
    expect(resumed?.recap).toBeUndefined();
  });

  it("writes plain lines under the post", () => {
    const lines = breakRecapLines(
      {
        challenge: "Drink a glass of water",
        challengeDone: 3,
        highFives: [
          { userId: "kai", count: 4 },
          { userId: "ana", count: 1 },
        ],
      },
      new Map([
        ["kai", "Kai"],
        ["ana", "Ana"],
      ]),
    );
    expect(lines).toEqual([
      "✅ 3 people did the break challenge: Drink a glass of water",
      "👋 High-fives: Kai 4 · Ana 1",
    ]);
    expect(squadPost("studyResumed", "Back to it.", ["Ana"], 1, "📚 Focus", lines)).toBe(
      ["📚 Focus", "Ana Back to it.", ...lines].join("\n"),
    );
  });
});
