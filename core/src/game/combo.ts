import { GAME } from "../constants";

/** 1 person: 1.0x. Each extra person adds 0.2x, with no cap (6 people is 2.0x). */
export function comboFor(peopleCount: number, enabled = true): number {
  if (!enabled || peopleCount <= 1) return 1;
  const raw = 1 + GAME.comboStep * (peopleCount - 1);
  // Round to one decimal so 1 + 0.2 * 3 is exactly 1.6, not 1.6000000000000001.
  return Math.round(raw * 10) / 10;
}

export function formatCombo(combo: number): string {
  return `${combo.toFixed(1)}x`;
}
