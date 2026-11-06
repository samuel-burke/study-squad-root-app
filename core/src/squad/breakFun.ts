/**
 * Things to do on a break: a shared break challenge, and high-fives between
 * members who are on a break together. Neither gives XP, so there's nothing
 * to farm. Both live in the server's memory only, for the break they belong to.
 */

export interface BreakChallenge {
  id: string;
  text: string;
}

/** Short, screen-free things to do in a 5 minute break. */
export const BREAK_CHALLENGES: readonly BreakChallenge[] = [
  { id: "water", text: "Drink a glass of water" },
  { id: "stretch", text: "Stand up and stretch for 30 seconds" },
  { id: "window", text: "Look out a window at something far away for 20 seconds" },
  { id: "breaths", text: "Take five slow, deep breaths" },
  { id: "walk", text: "Walk around the room once" },
  { id: "shoulders", text: "Roll your shoulders back 10 times" },
  { id: "eyes", text: "Close your eyes and rest them for 30 seconds" },
  { id: "tidy", text: "Tidy one thing on your desk" },
  { id: "snack", text: "Grab a healthy snack" },
  { id: "jacks", text: "Do 10 jumping jacks" },
  { id: "hands", text: "Shake out your hands and wrists" },
  { id: "air", text: "Open a window or step outside for fresh air" },
  { id: "kind", text: "Send someone a kind message" },
  { id: "toes", text: "Touch your toes, or try to" },
  { id: "posture", text: "Fix your posture: feet flat, shoulders back" },
  { id: "learned", text: "Write down one thing you just learned" },
  { id: "squats", text: "Do 5 squats" },
  { id: "refill", text: "Refill your drink" },
];

/**
 * High-fives one member can send the same teammate in one break. Beyond
 * this, taps do nothing, so nobody can flood a teammate's screen.
 */
export const HIGH_FIVES_PER_TEAMMATE = 5;

/** What members can send each other. */
export const HIGH_FIVE_EMOJI = ["👋", "🔥"] as const;
export type HighFiveEmoji = (typeof HIGH_FIVE_EMOJI)[number];

export function isHighFiveEmoji(value: unknown): value is HighFiveEmoji {
  return typeof value === "string" && (HIGH_FIVE_EMOJI as readonly string[]).includes(value);
}

/** Everyone on the room timer shares a break, named by when it started. */
export function roomBreakKey(phaseStartedAt: number): string {
  return `room:${phaseStartedAt}`;
}

/** A solo break belongs to one member, named by when it ends. */
export function soloBreakKey(userId: string, breakEndsAt: number): string {
  return `solo:${userId}:${breakEndsAt}`;
}

/**
 * The challenge for a break. It's worked out from the break's key, so the
 * server and every device agree on it without sending it anywhere.
 */
export function breakChallengeFor(key: string): BreakChallenge {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return BREAK_CHALLENGES[(hash >>> 0) % BREAK_CHALLENGES.length]!;
}
