import { describe, expect, it } from "vitest";
import { PRESETS, type RoomTimerDto } from "@studyroom/core";
import {
  avatarColor,
  freezeDays,
  heatLevel,
  initials,
  nextLabel,
  percent,
  phaseCaption,
  phasePill,
  remainingFraction,
  rowTime,
  statusChip,
} from "../src/lib/view";

const MIN = 60_000;
const timer = (overrides: Partial<RoomTimerDto> = {}): RoomTimerDto => ({
  phase: "focus",
  round: 2,
  rounds: 4,
  phaseStartedAt: 0,
  phaseEndsAt: 25 * MIN,
  preset: PRESETS["25-5"],
  ...overrides,
});

describe("status chips", () => {
  it("labels each status like the design", () => {
    const now = 0;
    expect(statusChip({ status: "roomFocus", endsAt: 14 * MIN + 32_000 }, now)).toEqual({
      label: "Room timer · 14:32",
      tone: "room",
    });
    expect(statusChip({ status: "soloFocus", endsAt: 38 * MIN + 10_000 }, now)).toEqual({
      label: "Solo · 38:10",
      tone: "solo",
    });
    expect(statusChip({ status: "soloBreak", endsAt: 3 * MIN + 12_000 }, now)).toEqual({
      label: "Break · back in 03:12",
      tone: "break",
    });
    expect(statusChip({ status: "roomBreak", endsAt: 0 }, 5_000).label).toBe(
      "Break · back in 00:00",
    );
  });

  it("uses short labels on mobile rows", () => {
    expect(rowTime({ status: "roomFocus", endsAt: MIN }, 0)).toBe("Room");
    expect(rowTime({ status: "soloFocus", endsAt: MIN }, 0)).toBe("Solo 01:00");
    expect(rowTime({ status: "roomBreak", endsAt: MIN }, 0)).toBe("Break 01:00");
  });
});

describe("phase text", () => {
  it("describes the room phase", () => {
    expect(phasePill(timer())).toBe("Focus · round 2 of 4");
    expect(phasePill(timer({ phase: "break" }))).toBe("Break · round 2 of 4");
    expect(phasePill(timer({ phase: "longBreak" }))).toBe("Long break");
    expect(phasePill(timer({ phase: "idle" }))).toBe("Room timer is free");
    expect(phaseCaption(timer())).toBe("left in focus");
  });

  it("says what comes next", () => {
    expect(nextLabel(timer())).toBe("Next: 5 minute break for everyone");
    expect(nextLabel(timer({ round: 4 }))).toBe("Next: 15 minute long break for everyone");
    expect(nextLabel(timer({ phase: "break" }))).toBe("Next: round 3 of 4");
    expect(nextLabel(timer({ phase: "idle" }))).toMatch(/Join/);
  });
});

describe("remainingFraction", () => {
  it("runs from 1 to 0 across the phase and clamps", () => {
    expect(remainingFraction(timer(), 0)).toBe(1);
    expect(remainingFraction(timer(), 12.5 * MIN)).toBe(0.5);
    expect(remainingFraction(timer(), 99 * MIN)).toBe(0);
    expect(remainingFraction(timer({ phase: "idle" }), 5)).toBe(1);
  });
});

describe("small helpers", () => {
  it("makes initials", () => {
    expect(initials("Ana R.")).toBe("AR");
    expect(initials("Marcus")).toBe("MA");
    expect(initials("  ")).toBe("?");
  });

  it("picks a stable avatar color", () => {
    expect(avatarColor("user-1")).toBe(avatarColor("user-1"));
    expect(avatarColor("user-1")).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("buckets heatmap days", () => {
    expect([0, 10, 45, 120].map(heatLevel)).toEqual([0, 1, 2, 3]);
  });

  describe("freezeDays", () => {
    // Mon 2 .. Tue 10 Nov 2026; minutes per day.
    const week = (minutes: number[]) =>
      minutes.map((m, i) => ({
        day: `2026-11-${String(2 + i).padStart(2, "0")}`,
        counted: m > 0,
      }));
    const frozen = (minutes: number[], streak: number) => [...freezeDays(week(minutes), streak)];

    it("marks nothing on an unbroken streak, with or without today", () => {
      expect(frozen([0, 0, 0, 40, 40, 40, 40, 40, 0], 5)).toEqual([]);
      expect(frozen([0, 0, 0, 40, 40, 40, 40, 40, 40], 6)).toEqual([]);
    });

    it("marks a missed day the freeze is still holding up", () => {
      // Samuel's case: Thu-Sun, skipped Monday, today Tuesday.
      expect(frozen([0, 0, 0, 40, 40, 40, 40, 0, 0], 4)).toEqual(["2026-11-09"]);
    });

    it("marks a covered day inside the streak", () => {
      expect(frozen([0, 0, 0, 40, 0, 40, 40, 0, 40], 4)).toEqual(["2026-11-09", "2026-11-06"]);
    });

    it("treats focus without a finished session as a missed day", () => {
      // Samuel's week: Thu-Sun counted, Monday missed, Tue and Wed only had unfinished focus.
      const days = week([0, 0, 0, 40, 40, 40, 40, 0, 0, 0]).map((d, i) =>
        i >= 8 ? { ...d, counted: false } : d,
      );
      expect([...freezeDays(days, 0)]).toEqual([]);
      expect([...freezeDays(days.slice(0, 9), 4)]).toEqual(["2026-11-09"]);
    });

    it("stops at the start of the streak, so older gaps stay plain", () => {
      expect(frozen([40, 0, 0, 40, 40, 0, 0, 0, 0], 0)).toEqual([]);
      expect(frozen([40, 0, 0, 40, 40, 0, 0, 0, 40], 1)).toEqual([]);
    });
  });

  it("computes bounded percentages", () => {
    expect(percent(415, 500)).toBe(83);
    expect(percent(5, 0)).toBe(0);
    expect(percent(9, 5)).toBe(100);
  });
});
