import {
  ALL_PERSONALITIES,
  RARE_LINES,
  SQUAD_LINES,
  type Personality,
  type SquadEvent,
} from "./squadLines";

/** About one timer post in 25 is a rare line instead. Joins and badges never are. */
export const RARE_CHANCE = 1 / 25;

export interface SquadLineContext {
  /** The focus round the post is about, for `{round}`. */
  round: number;
  /** How long the room has been running without emptying, for rare lines. */
  togetherMinutes: number;
  /** The badge names for `{badge}`, already joined ("Night Owl and Week Warrior"). */
  badge?: string;
}

/** The last line posted for each event, and the last rare line, so nothing repeats back to back. */
export type LastSquadLines = Partial<Record<SquadEvent | "rare", string>>;

export interface PickedLine {
  /** Stable id such as "breakStarted.chill.2" or "rare.1". */
  id: string;
  text: string;
}

function fill(text: string, context: SquadLineContext): string {
  return text
    .replace("{round}", String(context.round))
    .replace("{hours}", String(Math.floor(context.togetherMinutes / 60)))
    .replace("{badge}", context.badge ?? "a badge");
}

function pickFrom<T extends { id: string }>(
  options: readonly T[],
  avoid: string | undefined,
  random: () => number,
): T | undefined {
  const fresh = options.length > 1 ? options.filter((o) => o.id !== avoid) : options;
  return fresh[Math.min(fresh.length - 1, Math.floor(random() * fresh.length))];
}

/**
 * Picks what the bot says for `event`: a random line from the enabled
 * personalities, or now and then a rare one. Never the same line twice in a
 * row for an event. `random` returns [0, 1) like Math.random.
 */
export function pickSquadLine(
  event: SquadEvent,
  personalities: readonly Personality[],
  last: LastSquadLines,
  random: () => number,
  context: SquadLineContext,
): PickedLine & { rare: boolean } {
  if (event !== "memberJoined" && event !== "badgeUnlocked" && random() < RARE_CHANCE) {
    const rare = pickFrom(
      RARE_LINES.map((line, i) => ({ ...line, id: `rare.${i}` })).filter(
        (line) => context.togetherMinutes >= (line.minTogetherMinutes ?? 0),
      ),
      last.rare,
      random,
    );
    if (rare) return { id: rare.id, text: fill(rare.text, context), rare: true };
  }
  const voices = personalities.length > 0 ? personalities : ALL_PERSONALITIES;
  const pool = voices.flatMap((p) =>
    SQUAD_LINES[event][p].map((text, i) => ({ id: `${event}.${p}.${i}`, text })),
  );
  const line = pickFrom(pool, last[event], random)!;
  return { id: line.id, text: fill(line.text, context), rare: false };
}
