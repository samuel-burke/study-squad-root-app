import { describe, expect, it } from "vitest";
import { DomainError, ErrorCode, LIMITS } from "../src";
import { configWith, createHarness, MINUTE, T0 } from "./helpers";

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

describe("study tables", () => {
  it("runs a new table on its own timer next to the main table", async () => {
    const { engine, advance } = createHarness(NO_BOSS);
    await engine.joinRoomTimer("ana");
    await advance(10 * MINUTE);
    const snap = await engine.joinRoomTimer("kai", {
      newTableName: "  Calc II ",
      newTablePreset: "50-10",
    });
    const calc = snap.room.tables[1]!;
    expect(snap.room.tables.map((t) => [t.id, t.name])).toEqual([
      ["main", ""],
      [calc.id, "Calc II"],
    ]);
    expect(calc.timer).toMatchObject({
      phase: "focus",
      phaseStartedAt: T0 + 10 * MINUTE,
      phaseEndsAt: T0 + 60 * MINUTE,
    });
    // `timer` stays the main table's.
    expect(snap.room.timer.phaseEndsAt).toBe(T0 + 25 * MINUTE);
    expect(snap.me).toMatchObject({ tableId: calc.id, endsAt: T0 + 60 * MINUTE });
    expect(snap.room.members.map((m) => [m.userId, m.tableId, m.endsAt])).toEqual([
      ["ana", "main", T0 + 25 * MINUTE],
      ["kai", calc.id, T0 + 60 * MINUTE],
    ]);
  });

  it("shares one combo across every table", async () => {
    const { engine, advance, notifier } = createHarness(NO_BOSS);
    await engine.joinRoomTimer("ana");
    await engine.joinRoomTimer("marcus");
    const snap = await engine.joinRoomTimer("kai", { newTableName: "Calc II" });
    await engine.joinRoomTimer("devon", { tableId: snap.room.tables[1]!.id });
    expect((await engine.getSnapshot("ana")).room).toMatchObject({
      roomParticipantCount: 4,
      combo: 1.3,
    });
    // The main table's round pays its two finishers plus the two at Calc II.
    await advance(25 * MINUTE);
    const ana = notifier.personal.find((p) => p.userId === "ana")!.event;
    expect(ana.combo).toBe(1.3);
  });

  it("moves a member between tables, crediting the old one and closing it once empty", async () => {
    const { engine, advance } = createHarness(NO_BOSS);
    await engine.joinRoomTimer("ana");
    const created = await engine.joinRoomTimer("kai", { newTableName: "Calc II" });
    const calcId = created.room.tables[1]!.id;
    await advance(10 * MINUTE);
    const snap = await engine.joinRoomTimer("kai", { tableId: "main" });
    expect(snap.room.tables.map((t) => t.id)).toEqual(["main"]);
    expect(snap.me.tableId).toBe("main");
    // Ten minutes at Calc II, at the room's 1.1x combo.
    expect(snap.me.xpToday).toBe(22);
    await expectError(engine.joinRoomTimer("ana", { tableId: calcId }), ErrorCode.NotFound);
  });

  it("closes a table when its last member leaves, and keeps the rest running", async () => {
    const { engine } = createHarness(NO_BOSS);
    await engine.joinRoomTimer("ana");
    await engine.joinRoomTimer("kai", { newTableName: "Calc II" });
    const snap = await engine.leaveRoomTimer("kai");
    expect(snap.room.tables.map((t) => t.id)).toEqual(["main"]);
    expect(snap.me.tableId).toBe("");
    expect((await engine.leaveRoomTimer("ana")).room.tables).toEqual([]);
  });

  it("checks table names and caps how many tables run at once", async () => {
    const { engine } = createHarness(NO_BOSS);
    await expectError(
      engine.joinRoomTimer("ana", { newTableName: "x".repeat(31) }),
      ErrorCode.Validation,
    );
    for (let i = 0; i < LIMITS.maxTables; i++) {
      await engine.joinRoomTimer(`m${i}`, { newTableName: `Table ${i}` });
    }
    await expectError(
      engine.joinRoomTimer("ana", { newTableName: "One more" }),
      ErrorCode.Conflict,
    );
  });

  it("gives each table its own break challenge", async () => {
    const { engine, advance } = createHarness(NO_BOSS);
    await engine.joinRoomTimer("ana");
    await engine.joinRoomTimer("kai", { newTableName: "Calc II" });
    await advance(25 * MINUTE);
    const snap = await engine.completeBreakChallenge("kai");
    const kai = snap.room.members.find((m) => m.userId === "kai")!;
    const ana = snap.room.members.find((m) => m.userId === "ana")!;
    expect(kai).toMatchObject({ status: "roomBreak", challengeDone: true });
    expect(ana).toMatchObject({ status: "roomBreak", challengeDone: false });
  });
});
