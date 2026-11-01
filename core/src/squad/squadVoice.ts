import {
  ALL_PERSONALITIES,
  MOVIE_LINES,
  RARE_LINES,
  SQUAD_LINES,
  type Personality,
  type SquadEvent,
} from "./squadLines";

export interface SquadLineContext {
  /** The focus round the post is about, for `{round}`. */
  round: number;
  /** How long the room has been running without emptying, for lines like "studying together for 2 hours". */
  togetherMinutes: number;
  /** The badge names for `{badge}`, already joined ("Night Owl and Week Warrior"). */
  badge?: string;
}

/** The last line posted for each event, and the last movie line, so nothing repeats back to back. */
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

/**
 * Picks what the bot says for `event`: a random line from the enabled
 * personalities or the movie lines, every line equally likely. Never the same
 * line twice in a row for an event, and never the last timer movie line again.
 * `random` returns [0, 1) like Math.random.
 */
export function pickSquadLine(
  event: SquadEvent,
  personalities: readonly Personality[],
  last: LastSquadLines,
  random: () => number,
  context: SquadLineContext,
): PickedLine & { rare: boolean } {
  const voices = personalities.length > 0 ? personalities : ALL_PERSONALITIES;
  const pool = voices.flatMap((p) =>
    SQUAD_LINES[event][p].map((text, i) => ({ id: `${event}.${p}.${i}`, text, rare: false })),
  );
  if (event === "memberJoined" || event === "badgeUnlocked") {
    MOVIE_LINES[event].forEach((text, i) =>
      pool.push({ id: `${event}.movie.${i}`, text, rare: false }),
    );
  } else {
    RARE_LINES.forEach((line, i) => {
      if (context.togetherMinutes >= (line.minTogetherMinutes ?? 0)) {
        pool.push({ id: `rare.${i}`, text: line.text, rare: true });
      }
    });
  }
  const fresh = pool.filter((l) => l.id !== last[event] && l.id !== last.rare);
  const options = fresh.length > 0 ? fresh : pool;
  const line = options[Math.min(options.length - 1, Math.floor(random() * options.length))]!;
  return { id: line.id, text: fill(line.text, context), rare: line.rare };
}
