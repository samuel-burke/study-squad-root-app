import { describe, expect, it } from "vitest";
import {
  addDays,
  dayKey,
  daysBetween,
  isValidTimeZone,
  monthKey,
  nextMonthStart,
  nextOccurrence,
  nextWeekStart,
  nextYearStart,
  startOfDay,
  weekdayIndex,
  weekdayName,
  weekKey,
  yearKey,
  zonedTimeToUtc,
} from "../src";

const NY = "America/New_York";

describe("dayKey", () => {
  it("uses the community's local date, not UTC", () => {
    // 2026-10-29 10:00 UTC is 6 AM on the 29th in New York and 7 PM in Tokyo.
    expect(dayKey(Date.UTC(2026, 9, 29, 10), NY)).toBe("2026-10-29");
    expect(dayKey(Date.UTC(2026, 9, 29, 10), "UTC")).toBe("2026-10-29");
    // 2026-10-29 02:00 UTC is still the evening of the 28th in New York.
    expect(dayKey(Date.UTC(2026, 9, 29, 2), NY)).toBe("2026-10-28");
    expect(dayKey(Date.UTC(2026, 9, 29, 2), "Asia/Tokyo")).toBe("2026-10-29");
  });

  it("starts the day at 4 AM, so after midnight still counts as the night before", () => {
    // 3:59 AM and 4:00 AM EDT on the 29th.
    expect(dayKey(Date.UTC(2026, 9, 29, 7, 59), NY)).toBe("2026-10-28");
    expect(dayKey(Date.UTC(2026, 9, 29, 8, 0), NY)).toBe("2026-10-29");
    // Same on the night the clocks spring forward: 3:30 AM EDT on 2026-03-08.
    expect(dayKey(Date.UTC(2026, 2, 8, 7, 30), NY)).toBe("2026-03-07");
  });

  it("starts each day at 4 AM local time", () => {
    expect(startOfDay("2026-10-29", NY)).toBe(Date.UTC(2026, 9, 29, 8));
  });
});

describe("day arithmetic", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2027-01-02", "2026-12-30")).toBe(-3);
  });

  it("starts weeks on Monday", () => {
    expect(weekdayIndex("2026-10-26")).toBe(0);
    expect(weekdayName("2026-10-27")).toBe("Tuesday");
    expect(weekKey("2026-11-01")).toBe("2026-10-26"); // Sunday belongs to the week before
    expect(weekKey("2026-11-02")).toBe("2026-11-02");
  });
});

describe("zonedTimeToUtc", () => {
  it("converts wall-clock time in standard and daylight time", () => {
    expect(zonedTimeToUtc("2026-07-01", 21, 0, NY)).toBe(Date.UTC(2026, 6, 2, 1, 0));
    expect(zonedTimeToUtc("2026-12-01", 21, 0, NY)).toBe(Date.UTC(2026, 11, 2, 2, 0));
  });

  it("handles the days the clocks change", () => {
    // DST ends 2026-11-01 in New York: 9 PM that evening is already EST.
    expect(zonedTimeToUtc("2026-11-01", 21, 0, NY)).toBe(Date.UTC(2026, 10, 2, 2, 0));
    // DST starts 2026-03-08: 9 PM is EDT.
    expect(zonedTimeToUtc("2026-03-08", 21, 0, NY)).toBe(Date.UTC(2026, 2, 9, 1, 0));
  });
});

describe("nextOccurrence", () => {
  it("returns later today when the time hasn't passed", () => {
    const now = Date.UTC(2026, 9, 28, 14); // 10 AM in NY
    expect(nextOccurrence(now, 21, 0, NY)).toBe(Date.UTC(2026, 9, 29, 1));
  });

  it("rolls to tomorrow when the time has passed or is exactly now", () => {
    const ninePm = Date.UTC(2026, 9, 29, 1);
    expect(nextOccurrence(ninePm, 21, 0, NY)).toBe(Date.UTC(2026, 9, 30, 1));
  });

  it("goes by the wall clock, not the 4 AM day", () => {
    const oneAm = Date.UTC(2026, 9, 29, 5);
    expect(nextOccurrence(oneAm, 3, 0, NY)).toBe(Date.UTC(2026, 9, 29, 7));
  });
});

describe("nextWeekStart", () => {
  it("is next Monday at 4 AM local time", () => {
    const wednesday = Date.UTC(2026, 9, 28, 14);
    // Monday 2026-11-02 04:00 EST = 09:00 UTC (DST ended on the 1st).
    expect(nextWeekStart(wednesday, NY)).toBe(Date.UTC(2026, 10, 2, 9));
  });

  it("keeps late Sunday night in the old week", () => {
    const mondayOneAm = Date.UTC(2026, 10, 2, 6); // 1 AM EST
    expect(nextWeekStart(mondayOneAm, NY)).toBe(Date.UTC(2026, 10, 2, 9));
  });
});

describe("month and year", () => {
  it("finds the first day and the next start in the community's zone", () => {
    expect(monthKey("2026-10-28")).toBe("2026-10-01");
    expect(yearKey("2026-10-28")).toBe("2026-01-01");
    // 2026-11-01 03:00 UTC is still October 31 in New York.
    const halloweenNight = Date.UTC(2026, 10, 1, 3);
    // November 1 04:00 EST = 09:00 UTC (DST ends at 2 AM that night).
    expect(nextMonthStart(halloweenNight, NY)).toBe(Date.UTC(2026, 10, 1, 9));
    // December rolls over into the new year, at 04:00 EST = 09:00 UTC.
    expect(nextMonthStart(Date.UTC(2026, 11, 15, 12), NY)).toBe(Date.UTC(2027, 0, 1, 9));
    expect(nextYearStart(halloweenNight, NY)).toBe(Date.UTC(2027, 0, 1, 9));
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects junk", () => {
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });
});
