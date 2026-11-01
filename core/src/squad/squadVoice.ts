import {
  ALL_PERSONALITIES,
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
 * The bot keeps one mood for a whole session so its tone stays consistent:
 * one of the personalities, or "movie" for the shared movie-reference lines
 * (RARE_LINES).
 */
export type SquadMood = Personality | "movie";

/** The moods the bot takes turns with, one per session: the enabled personalities, then movie lines. */
export function squadMoods(personalities: readonly Personality[]): SquadMood[] {
  return [...(personalities.length > 0 ? personalities : ALL_PERSONALITIES), "movie"];
}

/** The mood for the session numbered `turn`, counting up from 0. */
export function moodForTurn(personalities: readonly Personality[], turn: number): SquadMood {
  const moods = squadMoods(personalities);
  return moods[((turn % moods.length) + moods.length) % moods.length]!;
}

/** Joins and badges aren't about the timer, so the movie mood has no lines for them. */
function isTimerEvent(event: SquadEvent): boolean {
  return event !== "memberJoined" && event !== "badgeUnlocked";
}

/**
 * Picks what the bot says for `event` in `mood`. Every line in the mood is
 * equally likely. In the movie mood, joins and badges borrow the enabled
 * personalities' lines. Never the same line twice in a row for an event, and
 * never the last movie line again. `random` returns [0, 1) like Math.random.
 */
export function pickSquadLine(
  event: SquadEvent,
  mood: SquadMood,
  personalities: readonly Personality[],
  last: LastSquadLines,
  random: () => number,
  context: SquadLineContext,
): PickedLine & { rare: boolean } {
  const movieLines = () =>
    RARE_LINES.flatMap((line, i) =>
      context.togetherMinutes >= (line.minTogetherMinutes ?? 0)
        ? [{ id: `rare.${i}`, text: line.text, rare: true }]
        : [],
    );
  const voices: readonly Personality[] =
    mood !== "movie" ? [mood] : personalities.length > 0 ? personalities : ALL_PERSONALITIES;
  const pool =
    mood === "movie" && isTimerEvent(event)
      ? movieLines()
      : voices.flatMap((p) =>
          SQUAD_LINES[event][p].map((text, i) => ({ id: `${event}.${p}.${i}`, text, rare: false })),
        );
  const fresh = pool.filter((l) => l.id !== last[event] && l.id !== last.rare);
  const options = fresh.length > 0 ? fresh : pool;
  const line = options[Math.min(options.length - 1, Math.floor(random() * options.length))]!;
  return { id: line.id, text: fill(line.text, context), rare: line.rare };
}
