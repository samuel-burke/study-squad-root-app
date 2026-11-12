/**
 * Color tiers: the app's accent color follows a member's lifetime focus hours.
 * Spark is the default look. Each tier up glows a little more (styles.css).
 */
export const TIERS = [
  { id: "spark", name: "Spark", hours: 0 },
  { id: "ember", name: "Ember", hours: 10 },
  { id: "blaze", name: "Blaze", hours: 50 },
  { id: "nebula", name: "Nebula", hours: 150 },
  { id: "supernova", name: "Supernova", hours: 400 },
  { id: "starlight", name: "Starlight", hours: 1000 },
] as const;

export type Tier = (typeof TIERS)[number];

/** The highest tier the member's lifetime focus minutes reach, and the one after it. */
export function tierFor(focusMinutes: number): { tier: Tier; next?: Tier } {
  const reached = TIERS.filter((t) => focusMinutes >= t.hours * 60).length;
  return { tier: TIERS[reached - 1] ?? TIERS[0], next: TIERS[reached] };
}
