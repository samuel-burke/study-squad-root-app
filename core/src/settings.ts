import { ALL_PERSONALITIES, type Personality } from "./squad/squadLines";
import { isValidTimeZone } from "./time/calendar";
import {
  customPreset,
  DEFAULT_PRESET,
  PRESETS,
  type PresetKey,
  type TimerPreset,
} from "./timer/presets";

/**
 * Keys of the Global Settings declared in root-manifest.json. Admins edit
 * these in Root's App settings; the server reads them on start and on update.
 * A unit test checks the manifest declares exactly these keys.
 */
export const SETTINGS = {
  room: {
    group: "room",
    preset: "timerPreset",
    customFocus: "customFocusMinutes",
    customBreak: "customBreakMinutes",
    postChannel: "postChannel",
    squadMentions: "squadMentions",
    voiceChannel: "voiceChannelName",
    recapEnabled: "recapEnabled",
    recapTime: "recapTime",
    recapLeaderboard: "recapLeaderboard",
    timeZone: "timeZone",
    goalsPublic: "goalsPublicByDefault",
    busyPosts: "busyPosts",
    busyThreshold: "busyThreshold",
    squadBot: "squadBot",
    squadPersonalities: "squadPersonalities",
  },
  game: {
    group: "game",
    xpEnabled: "xpEnabled",
    dailyXpCap: "dailyXpCap",
    comboEnabled: "comboEnabled",
    bossEnabled: "bossEnabled",
    bossName: "bossName",
    bossBaseHp: "bossBaseHpXp",
    streakFreezes: "streakFreezes",
    milestonePosts: "milestonePosts",
  },
} as const;

/**
 * Limits for the number settings. root-manifest.json declares the same
 * minValue, maxValue, step and defaultValue (a unit test checks they match),
 * and parseSettings clamps to them, since Root's limits are only a hint in
 * its settings form. All values are whole numbers.
 */
export const NUMBER_LIMITS = {
  customFocusMinutes: { min: 5, max: 120, step: 1, default: 25 },
  customBreakMinutes: { min: 1, max: 30, step: 1, default: 5 },
  busyThreshold: { min: 2, max: 100, step: 1, default: 5 },
  dailyXpCap: { min: 50, max: 2000, step: 10, default: 300 },
  bossBaseHpXp: { min: 100, max: 1_000_000, step: 100, default: 10_000 },
} as const;

export interface AppConfig {
  presetKey: PresetKey;
  preset: TimerPreset;
  timeZone: string;
  /** Channel for recaps, busy-room and milestone posts. null = don't post. */
  postChannelId: string | null;
  /** Display name of that channel, resolved by the server. Empty if unknown. */
  postChannelName: string;
  /**
   * Voice channel the "Join voice" button opens, found by the server from
   * voiceChannelName. null = no button.
   */
  voiceChannelId: string | null;
  /** The name the admin typed, then the channel's own name once found. "" = off. */
  voiceChannelName: string;
  /** A link that opens the channel in Root, resolved by the server. */
  voiceChannelUrl: string;
  /**
   * What the server made of the voice channel setting, in words for admins
   * (shown in the in-app Room settings). "" = no name typed.
   */
  voiceChannelStatus: string;
  recap: { enabled: boolean; hours: number; minutes: number };
  /** List the week's top focusers in the daily recap. */
  recapLeaderboardEnabled: boolean;
  goalsPublicByDefault: boolean;
  busyPosts: { enabled: boolean; threshold: number };
  /**
   * The squad bot: posts in the channel when the room timer starts, switches
   * and finishes, and when someone joins, in the voices admins picked.
   */
  squadBot: {
    enabled: boolean;
    personalities: Personality[];
    /** @mention (ping) people in its posts. Off = their names in plain text. */
    mentions: boolean;
  };
  xp: { enabled: boolean; dailyCap: number };
  comboEnabled: boolean;
  /**
   * name is the admin's custom boss name, or "" for a new built-in name each week.
   * baseHpXp is a 1x boss's HP in XP; each boss multiplies it by its strength.
   */
  boss: { enabled: boolean; name: string; baseHpXp: number };
  streakFreezesEnabled: boolean;
  milestonePostsEnabled: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  presetKey: "25-5",
  preset: DEFAULT_PRESET,
  timeZone: "America/New_York",
  postChannelId: null,
  postChannelName: "",
  voiceChannelId: null,
  voiceChannelName: "",
  voiceChannelUrl: "",
  voiceChannelStatus: "",
  recap: { enabled: true, hours: 21, minutes: 0 },
  recapLeaderboardEnabled: true,
  goalsPublicByDefault: true,
  busyPosts: { enabled: true, threshold: NUMBER_LIMITS.busyThreshold.default },
  squadBot: { enabled: true, personalities: [...ALL_PERSONALITIES], mentions: false },
  xp: { enabled: true, dailyCap: NUMBER_LIMITS.dailyXpCap.default },
  comboEnabled: true,
  boss: { enabled: true, name: "", baseHpXp: NUMBER_LIMITS.bossBaseHpXp.default },
  streakFreezesEnabled: true,
  milestonePostsEnabled: true,
};

/** The loosely typed shape Root hands us: groups of items, each a primitive or array. */
export type RawSettings = Record<string, Record<string, unknown> | undefined> | undefined;

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

/**
 * Accepts a number (a number setting), or a numeric key ("300" or ["300"]),
 * which is how the older select versions of these settings were saved.
 * Rounded to a whole number and clamped to [min, max].
 */
function int(value: unknown, fallback: number, min: number, max: number): number {
  const raw = typeof value === "number" ? value : Number(firstString(value) ?? Number.NaN);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

/**
 * A number setting. The Root SDK types these as number | undefined, but at
 * runtime it hands over the protobuf DoubleValue wrapper ({ value: 300 }),
 * so unwrap that first. Bare numbers and old select keys still work.
 */
function numberSetting(value: unknown, fallback: number, min: number, max: number): number {
  if (value && typeof value === "object" && !Array.isArray(value) && "value" in value)
    return int((value as { value: unknown }).value, fallback, min, max);
  return int(value, fallback, min, max);
}

function text(value: unknown, fallback: string, maxLength: number): string {
  const trimmed = typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  return trimmed.length > 0 ? trimmed : fallback;
}

/** A multi-select of personalities. Unknown keys are dropped; none picked means all. */
function personalities(value: unknown): Personality[] {
  const picked = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const known = ALL_PERSONALITIES.filter((p) => picked.includes(p));
  return known.length > 0 ? known : [...ALL_PERSONALITIES];
}

function timeOfDay(value: unknown, fallback: { hours: number; minutes: number }) {
  if (value && typeof value === "object") {
    const v = value as { hours?: unknown; minutes?: unknown };
    return {
      hours: int(v.hours, fallback.hours, 0, 23),
      minutes: int(v.minutes, fallback.minutes, 0, 59),
    };
  }
  return fallback;
}

function limited(value: unknown, key: keyof typeof NUMBER_LIMITS): number {
  const l = NUMBER_LIMITS[key];
  return numberSetting(value, l.default, l.min, l.max);
}

function presetFrom(key: string | undefined, focus: number, rest: number) {
  if (key === "50-10" || key === "25-5") return { presetKey: key, preset: PRESETS[key] } as const;
  if (key === "custom") return { presetKey: key, preset: customPreset(focus, rest) } as const;
  return { presetKey: DEFAULT_CONFIG.presetKey, preset: DEFAULT_CONFIG.preset };
}

/** Turns untrusted settings into a complete, range-checked config. Never throws. */
export function parseSettings(raw: RawSettings): AppConfig {
  const room = raw?.[SETTINGS.room.group] ?? {};
  const game = raw?.[SETTINGS.game.group] ?? {};
  const r = SETTINGS.room;
  const g = SETTINGS.game;
  const d = DEFAULT_CONFIG;

  const tz = firstString(room[r.timeZone]);
  const channel = firstString(room[r.postChannel]);

  return {
    ...presetFrom(
      firstString(room[r.preset]),
      limited(room[r.customFocus], "customFocusMinutes"),
      limited(room[r.customBreak], "customBreakMinutes"),
    ),
    timeZone: tz && isValidTimeZone(tz) ? tz : d.timeZone,
    postChannelId: channel && channel.length > 0 ? channel : null,
    postChannelName: "",
    voiceChannelId: null,
    voiceChannelName: text(room[r.voiceChannel], "", 100).replace(/^#\s*/, ""),
    voiceChannelUrl: "",
    voiceChannelStatus: "",
    recap: {
      enabled: bool(room[r.recapEnabled], d.recap.enabled),
      ...timeOfDay(room[r.recapTime], d.recap),
    },
    recapLeaderboardEnabled: bool(room[r.recapLeaderboard], d.recapLeaderboardEnabled),
    goalsPublicByDefault: bool(room[r.goalsPublic], d.goalsPublicByDefault),
    busyPosts: {
      enabled: bool(room[r.busyPosts], d.busyPosts.enabled),
      threshold: limited(room[r.busyThreshold], "busyThreshold"),
    },
    squadBot: {
      enabled: bool(room[r.squadBot], d.squadBot.enabled),
      personalities: personalities(room[r.squadPersonalities]),
      mentions: bool(room[r.squadMentions], d.squadBot.mentions),
    },
    xp: {
      enabled: bool(game[g.xpEnabled], d.xp.enabled),
      dailyCap: limited(game[g.dailyXpCap], "dailyXpCap"),
    },
    comboEnabled: bool(game[g.comboEnabled], d.comboEnabled),
    boss: {
      enabled: bool(game[g.bossEnabled], d.boss.enabled),
      name: text(game[g.bossName], "", 40),
      baseHpXp: limited(game[g.bossBaseHp], "bossBaseHpXp"),
    },
    streakFreezesEnabled: bool(game[g.streakFreezes], d.streakFreezesEnabled),
    milestonePostsEnabled: bool(game[g.milestonePosts], d.milestonePostsEnabled),
  };
}
