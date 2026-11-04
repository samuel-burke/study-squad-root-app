import { describe, expect, it } from "vitest";
import {
  ClockSync,
  DomainError,
  ErrorCode,
  formatCountdown,
  formatHours,
  pluralize,
  RateLimiter,
  safeDisplayName,
  SerialQueue,
  validateFeedbackText,
  validateGoalText,
  validateId,
  validateSoloMinutes,
  validateStartGoals,
} from "../src";

const expectCode = (fn: () => unknown, code: ErrorCode) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    return;
  }
  throw new Error("expected a DomainError");
};

describe("validation", () => {
  it("cleans feedback text but keeps its line breaks", () => {
    expect(validateFeedbackText("  Love it!\r\n\r\n\r\n\r\nCan we   get\u202e dark mode?  ")).toBe(
      "Love it!\n\nCan we get dark mode?",
    );
    expectCode(() => validateFeedbackText(" \n\t "), ErrorCode.Validation);
    expectCode(() => validateFeedbackText(42), ErrorCode.Validation);
    expectCode(() => validateFeedbackText("x".repeat(1001)), ErrorCode.Validation);
    expect(validateFeedbackText("x".repeat(1000))).toHaveLength(1000);
  });

  it("cleans goal text", () => {
    expect(validateGoalText("  Read   ch. 4\n\tnotes ")).toBe("Read ch. 4 notes");
    expect(validateGoalText("a\u202eb\u0000c")).toBe("a b c");
  });

  it("rejects empty, oversized and non-string goals", () => {
    expectCode(() => validateGoalText("   "), ErrorCode.Validation);
    expectCode(() => validateGoalText("x".repeat(141)), ErrorCode.Validation);
    expectCode(() => validateGoalText(42), ErrorCode.Validation);
  });

  it("drops blank start goals and limits how many", () => {
    expect(validateStartGoals(["Make 20 flashcards", "", "  "])).toEqual(["Make 20 flashcards"]);
    expectCode(() => validateStartGoals(["a", "b", "c", "d"]), ErrorCode.Validation);
  });

  it("bounds solo timer length", () => {
    expect(validateSoloMinutes(25)).toBe(25);
    expectCode(() => validateSoloMinutes(4), ErrorCode.Validation);
    expectCode(() => validateSoloMinutes(181), ErrorCode.Validation);
    expectCode(() => validateSoloMinutes(25.5), ErrorCode.Validation);
    expectCode(() => validateSoloMinutes("25"), ErrorCode.Validation);
  });

  it("accepts opaque ids and rejects anything odd", () => {
    expect(validateId("0b6d7c4e-1f6a-4f0e-9a43-6a1d2b1c1f0a")).toBeTruthy();
    expectCode(() => validateId("../../etc/passwd"), ErrorCode.Validation);
    expectCode(() => validateId(""), ErrorCode.Validation);
    expectCode(() => validateId({}), ErrorCode.Validation);
  });

  it("strips markup and mentions from display names", () => {
    expect(safeDisplayName("Ana R.")).toBe("Ana R.");
    expect(safeDisplayName("@everyone **boss**")).toBe("everyone boss");
    expect(safeDisplayName("<script>")).toBe("script");
    expect(safeDisplayName("   ")).toBe("Someone");
    expect(safeDisplayName(undefined)).toBe("Someone");
    expect(safeDisplayName("x".repeat(80))).toHaveLength(32);
  });
});

describe("ClockSync", () => {
  it("uses the lowest round-trip sample", () => {
    let local = 1_000;
    const sync = new ClockSync(() => local);
    sync.sample(1_000, 1_400, 6_200); // rtt 400 → offset 5000
    expect(sync.offset).toBe(5_000);
    sync.sample(2_000, 2_100, 7_100); // rtt 100 → offset 5050, better
    expect(sync.offset).toBe(5_050);
    sync.sample(3_000, 3_900, 99_999); // worse rtt, ignored
    expect(sync.offset).toBe(5_050);
    local = 10_000;
    expect(sync.now()).toBe(15_050);
  });

  it("falls back to push timestamps until a sample exists", () => {
    const sync = new ClockSync(() => 1_000);
    sync.observe(4_000);
    expect(sync.offset).toBe(3_000);
    sync.sample(1_000, 1_000, 2_000);
    sync.observe(50_000);
    expect(sync.offset).toBe(1_000);
  });
});

describe("RateLimiter", () => {
  it("allows a burst, then refills over time", () => {
    let now = 0;
    const limiter = new RateLimiter(3, 1, () => now);
    expect([1, 2, 3, 4].map(() => limiter.tryTake("u"))).toEqual([true, true, true, false]);
    expect(limiter.tryTake("other")).toBe(true);
    now = 1_000;
    expect(limiter.tryTake("u")).toBe(true);
    expect(limiter.tryTake("u")).toBe(false);
  });

  it("forgets refilled buckets once it tracks many keys, but keeps limiting busy ones", () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1, () => now);
    limiter.tryTake("busy");
    limiter.tryTake("busy");
    for (let i = 0; i < 10_000; i++) limiter.tryTake(`idle-${i}`);
    now = 500; // idle buckets (1 token used) aren't full yet, "busy" is empty
    expect(limiter.tryTake("busy")).toBe(false);
    now = 5_000; // everyone has refilled; the next take triggers eviction
    expect(limiter.tryTake("new")).toBe(true);
    expect(limiter.tryTake("busy")).toBe(true);
  });
});

describe("SerialQueue", () => {
  it("runs jobs one at a time and survives failures", async () => {
    const queue = new SerialQueue();
    const order: string[] = [];
    const slow = queue.run(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push("slow");
    });
    const failing = queue.run(async () => {
      order.push("fail");
      throw new Error("boom");
    });
    const fast = queue.run(async () => {
      order.push("fast");
      return 7;
    });
    await slow;
    await expect(failing).rejects.toThrow("boom");
    await expect(fast).resolves.toBe(7);
    expect(order).toEqual(["slow", "fail", "fast"]);
  });
});

describe("formatting", () => {
  it("formats countdowns", () => {
    expect(formatCountdown(14 * 60_000 + 32_000)).toBe("14:32");
    expect(formatCountdown(500)).toBe("00:01");
    expect(formatCountdown(-10)).toBe("00:00");
  });

  it("formats hours like the design", () => {
    expect(formatHours(41.5 * 60)).toBe("41.5 hrs");
    expect(formatHours(60)).toBe("1 hr");
    expect(formatHours(45)).toBe("45 min");
    expect(formatHours(3.75 * 60)).toBe("3.8 hrs");
  });

  it("pluralizes", () => {
    expect(pluralize(1, "goal")).toBe("1 goal");
    expect(pluralize(23, "goal")).toBe("23 goals");
    expect(pluralize(2, "person", "people")).toBe("2 people");
  });
});
