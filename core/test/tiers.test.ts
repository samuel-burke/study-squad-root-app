import { describe, expect, it } from "vitest";
import { TIERS, tierFor } from "../src/game/tiers";

describe("tierFor", () => {
  it.each([
    [0, "spark", "ember"],
    [599, "spark", "ember"],
    [600, "ember", "blaze"],
    [50 * 60, "blaze", "nebula"],
    [150 * 60, "nebula", "supernova"],
    [400 * 60 - 1, "nebula", "supernova"],
    [400 * 60, "supernova", "starlight"],
    [1000 * 60, "starlight", undefined],
    [99_999 * 60, "starlight", undefined],
  ])("%i minutes is %s", (minutes, tier, next) => {
    const result = tierFor(minutes);
    expect(result.tier.id).toBe(tier);
    expect(result.next?.id).toBe(next);
  });

  it("lists tiers from lowest to highest", () => {
    const hours = TIERS.map((t) => t.hours);
    expect(hours).toEqual([...hours].sort((a, b) => a - b));
    expect(hours[0]).toBe(0);
  });
});
