import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode, StudyRoomEngine, type Logger } from "@studyroom/core";
import type { Knex } from "knex";
import { RequestFailure, StudyRoomHandlers } from "../src/handlers";
import { KnexStore } from "../src/persistence/knexStore";
import {
  configWith,
  FakeClock,
  ManualScheduler,
  RecordingAnnouncer,
  RecordingNotifier,
  silentLogger,
  T0,
} from "../../core/test/helpers";
import { freshDatabase } from "./sqlite";

const MINUTE = 60_000;
/** 25/5 rounds of 4: the long break runs from T0 + 115 min to T0 + 130 min. */
const LONG_BREAK = T0 + 115 * MINUTE;
const CYCLE_END = T0 + 130 * MINUTE;

const mockLogger = () => ({
  info: vi.fn<Logger["info"]>(),
  warn: vi.fn<Logger["warn"]>(),
  error: vi.fn<Logger["error"]>(),
});

async function failure(promise: Promise<unknown>): Promise<RequestFailure> {
  const error = await promise.then(
    () => {
      throw new Error("expected failure");
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RequestFailure);
  return error as RequestFailure;
}

describe('"Keep going?" through the handlers on SQLite', () => {
  let db: Knex;
  let clock: FakeClock;
  let scheduler: ManualScheduler;
  let notifier: RecordingNotifier;
  let engine: StudyRoomEngine;
  let handlers: StudyRoomHandlers;
  let logger: ReturnType<typeof mockLogger>;

  function boot(options: ConstructorParameters<typeof StudyRoomHandlers>[2] = {}) {
    scheduler = new ManualScheduler();
    notifier = new RecordingNotifier();
    engine = new StudyRoomEngine({
      store: new KnexStore(db),
      clock,
      scheduler,
      notifier,
      announcer: new RecordingAnnouncer(),
      logger: silentLogger,
      config: configWith(),
      newId: () => "unused",
      random: () => 0.5,
    });
    logger = mockLogger();
    handlers = new StudyRoomHandlers(engine, logger, options);
  }

  async function advanceTo(at: number) {
    while (scheduler.at !== null && scheduler.at <= at) {
      clock.current = scheduler.at;
      scheduler.fireIfDue(clock.current);
      await engine.idle();
    }
    clock.current = at;
  }

  beforeEach(async () => {
    db = await freshDatabase();
    clock = new FakeClock(T0);
    boot();
  });

  afterEach(async () => {
    await engine.idle();
    await db.destroy();
  });

  it("asks in the long break and carries only whoever tapped into the next cycle", async () => {
    await handlers.joinRoomTimer("ana", { goals: [] });
    await handlers.joinRoomTimer("kai", { goals: [] });
    expect((await handlers.getRoom("ana")).me?.keepGoingEndsAtMs).toBe(0);

    await advanceTo(LONG_BREAK);
    expect((await handlers.getRoom("ana")).me?.keepGoingEndsAtMs).toBe(CYCLE_END);
    clock.current = LONG_BREAK + 3 * MINUTE;
    const me = await handlers.keepGoing("ana");
    expect(me).toMatchObject({ userId: "ana", keepGoingEndsAtMs: 0, onRoomTimer: true });

    await advanceTo(CYCLE_END);
    expect((await handlers.getRoom("ana")).me?.onRoomTimer).toBe(true);
    expect((await handlers.getRoom("kai")).me?.onRoomTimer).toBe(false);
    // Kai keeps all four finished rounds.
    expect(
      notifier.personal
        .filter((p) => p.userId === "kai" && p.event.finished)
        .map((p) => p.event.round),
    ).toEqual([1, 2, 3, 4]);
  });

  it("remembers a tap across a server restart", async () => {
    await handlers.joinRoomTimer("ana", { goals: [] });
    await advanceTo(LONG_BREAK);
    await handlers.keepGoing("ana");
    engine.stop();

    boot();
    await engine.start();
    await advanceTo(CYCLE_END);
    expect((await handlers.getRoom("ana")).me?.onRoomTimer).toBe(true);
  });

  it("treats a tap outside the long break as a harmless no-op", async () => {
    expect((await handlers.keepGoing("ana")).onRoomTimer).toBe(false);
    await handlers.joinRoomTimer("ana", { goals: [] });
    await handlers.keepGoing("ana");
    await advanceTo(CYCLE_END);
    expect((await handlers.getRoom("ana")).me?.onRoomTimer).toBe(false);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("refuses a tap without a caller identity", async () => {
    const error = await failure(handlers.keepGoing(""));
    expect(error.code).toBe(ErrorCode.Validation);
  });

  it("rate limits taps like any other write", async () => {
    boot({ writeLimit: { capacity: 1, perSecond: 0.001 }, now: () => 0 });
    await handlers.keepGoing("ana");
    const error = await failure(handlers.keepGoing("ana"));
    expect(error.code).toBe(ErrorCode.RateLimited);
    expect(logger.warn).toHaveBeenCalledWith("rate limited", {
      operation: "keepGoing",
      userId: "ana",
    });
  });

  it("hides storage failures behind a generic message, logs them and lets the tap be retried", async () => {
    await handlers.joinRoomTimer("ana", { goals: [] });
    await advanceTo(LONG_BREAK);
    // Fail the write inside the engine's transaction, so it must roll back.
    const transaction = KnexStore.prototype.transaction;
    const spy = vi.spyOn(KnexStore.prototype, "transaction").mockImplementationOnce(function (
      this: KnexStore,
      work,
    ) {
      return transaction.call(this, async (tx) => {
        tx.room.addParticipant = async () => {
          throw new Error("SQLITE_BUSY: database is locked");
        };
        return work(tx);
      });
    });
    const error = await failure(handlers.keepGoing("ana"));
    spy.mockRestore();
    expect(error.code).toBe(ErrorCode.Internal);
    expect(error.message).not.toContain("SQLITE");
    expect(logger.error).toHaveBeenCalledWith(
      "request failed",
      expect.objectContaining({
        operation: "keepGoing",
        error: expect.stringContaining("SQLITE_BUSY"),
      }),
    );
    // Nothing was saved, so the prompt is still up and a retry works.
    expect((await new KnexStore(db).room.listParticipants())[0]).toMatchObject({
      keepGoing: false,
    });
    expect((await handlers.keepGoing("ana")).keepGoingEndsAtMs).toBe(0);
    await advanceTo(CYCLE_END);
    expect((await handlers.getRoom("ana")).me?.onRoomTimer).toBe(true);
  });
});
