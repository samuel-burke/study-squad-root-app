import { BADGES } from "@studyroom/core";
import { describe, expect, it } from "vitest";
import { METALS, medalMetal } from "../src/components/BadgeMedal";

const badge = (id: string) => BADGES.find((b) => b.id === id)!;

describe("badge colors", () => {
  it("tints a colored badge but keeps its tier's stamp ink", () => {
    const owl = badge("night-owl");
    expect(owl.color).toBe("purple");
    expect(medalMetal(owl).rim).not.toEqual(METALS.silver.rim);
    expect(medalMetal(owl).stampInk).toBe(METALS.silver.stampInk);
  });

  it("leaves other badges in their tier metal", () => {
    expect(medalMetal(badge("streak-7"))).toBe(METALS.bronze);
  });
});
