import type { PhaseKind } from "./timer/roomCycle";
import type { PresetKey, TimerPreset } from "./timer/presets";
import type { DayKey } from "./time/calendar";
import type { QuestUnit } from "./game/quests";

/**
 * Transport-neutral shapes the engine produces. The server maps them to
 * Protobuf messages and the client maps those back, so the UI never depends
 * on generated code directly.
 */

export type MemberStatus = "roomFocus" | "roomBreak" | "soloFocus" | "soloBreak";
export type MyStatusKind = MemberStatus | "idle";
export type RoomPhase = "idle" | PhaseKind;

export interface RoomTimerDto {
  phase: RoomPhase;
  /** 1-based round, 0 when idle. */
  round: number;
  rounds: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  preset: TimerPreset;
}

export interface MemberCardDto {
  userId: string;
  status: MemberStatus;
  /** When the member's current focus or break ends (server time). */
  endsAt: number;
  /** Empty when the member keeps goals private or has none open. */
  goalText: string;
  goalPrivate: boolean;
  level: number;
  streak: number;
  /** Up to three badge ids to show on the card. */
  badges: string[];
  /** Card style id (see CARD_STYLES). */
  cardStyle: string;
  /** Place on this week's leaderboard. 0 when unranked or hidden from it. */
  weeklyRank: number;
}

export interface BossDto {
  enabled: boolean;
  name: string;
  /** HP and damage are in XP. */
  maxHpXp: number;
  damageXp: number;
  /** 0.5 to 2: how much tougher than the admin's base HP this boss is. */
  strength: number;
  /** XP each contributor gets when it's defeated. */
  lootXp: number;
  endsAt: number;
  defeated: boolean;
}

export interface RoomFeaturesDto {
  presetKey: PresetKey;
  xpEnabled: boolean;
  comboEnabled: boolean;
  bossEnabled: boolean;
  streakFreezesEnabled: boolean;
  goalsPublicByDefault: boolean;
  dailyXpCap: number;
  postChannelName: string;
}

/** The community voice channel admins picked for studying together. */
export interface VoiceDto {
  /** Empty when admins haven't picked one. */
  channelName: string;
  /** Opens the channel in Root. Empty when no link could be made. */
  joinUrl: string;
  /** Members in that channel right now. */
  userIds: string[];
}

export interface RoomStateDto {
  serverNow: number;
  timer: RoomTimerDto;
  members: MemberCardDto[];
  /** People with the app open or a session running. */
  presentCount: number;
  roomParticipantCount: number;
  /** Combo the room timer would earn right now. */
  combo: number;
  boss: BossDto;
  features: RoomFeaturesDto;
  voice: VoiceDto;
}

export interface GoalDto {
  id: string;
  text: string;
  done: boolean;
}

export interface MyStatusDto {
  userId: string;
  status: MyStatusKind;
  endsAt: number;
  onRoomTimer: boolean;
  xpTotal: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  xpToday: number;
  streak: number;
  freezeAvailable: boolean;
  goals: GoalDto[];
  goalsPrivate: boolean;
  /** When the "Keep going?" prompt closes (server time). 0 when it isn't showing. */
  keepGoingEndsAt: number;
  /**
   * Badges the member earned in the operation that produced this status, so
   * the unlock moment plays from the reply even if the badge push is lost.
   * Left out when there are none.
   */
  newBadges?: string[];
}

export interface SnapshotDto {
  room: RoomStateDto;
  me: MyStatusDto;
}

/** Sent to everyone when a room phase ends. */
export interface PhaseCompletedDto {
  kind: PhaseKind;
  round: number;
  finisherIds: string[];
  /** Boss damage, in XP. */
  roomDamageXp: number;
  combo: number;
  room: RoomStateDto;
}

/** Sent only to the member it is about, after a focus block they took part in. */
export interface PersonalResultDto {
  source: "room" | "solo";
  round: number;
  focusedMinutes: number;
  finished: boolean;
  baseXp: number;
  combo: number;
  xpEarned: number;
  /** True when the daily cap trimmed this award. */
  capped: boolean;
  streak: number;
  streakExtended: boolean;
  finisherIds: string[];
  /** Boss damage, in XP. */
  roomDamageXp: number;
  goalPrompt: GoalDto | null;
  breakEndsAt: number;
  me: MyStatusDto;
}

export interface DayStatDto {
  day: DayKey;
  focusMinutes: number;
}

export interface QuestDto {
  id: string;
  title: string;
  /** Capped at the target. Whole minutes when `unit` is "minutes". */
  progress: number;
  target: number;
  unit: QuestUnit;
  /** Reward for finishing; 0 when XP is off. */
  xp: number;
  done: boolean;
}

export interface EarnedBadgeDto {
  id: string;
  earnedAt: number;
}

export interface CardLookDto {
  /** The style the member picked, or "" for automatic. */
  chosenStyle: string;
  /** The badges the member picked, or empty for "most recent". */
  chosenShowcase: string[];
  /** What the card shows right now. */
  style: string;
  showcase: string[];
}

export interface ProgressDto {
  me: MyStatusDto;
  days: DayStatDto[];
  totalFocusMinutes: number;
  quests: QuestDto[];
  /** Earned badges, oldest first. The catalog itself lives in core (BADGES). */
  badges: EarnedBadgeDto[];
  card: CardLookDto;
}

/**
 * What any member can see about another by tapping them: game stats only.
 * Goals, focus history and leaderboard minutes stay out, so nothing a member
 * keeps private (or opted out of showing) leaks through a profile.
 */
export interface MemberProfileDto {
  userId: string;
  level: number;
  xpTotal: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  streak: number;
  /** Earned badges, oldest first. */
  badges: EarnedBadgeDto[];
  /** The badges on their card, as the board shows them. */
  showcase: string[];
  cardStyle: string;
}

/** What the leaderboard ranks by. */
export type LeaderboardMetric = "minutes" | "xp";

/**
 * The stretch of time the leaderboard covers, in the community time zone:
 * this week (from Monday), this month, this year, or all time.
 */
export type LeaderboardPeriod = "week" | "month" | "year" | "all";

export interface LeaderboardEntryDto {
  userId: string;
  /** Whole focus minutes in the period. */
  focusMinutes: number;
  /** XP earned in the period from focus, goals and quests. */
  xp: number;
  /** 1-based, by the board's metric. Members with the same total share a rank. */
  rank: number;
}

/** Standings for a period by focus minutes or XP. Members who opted out are never listed. */
export interface LeaderboardDto {
  /** What `entries` and `me.rank` are ranked by. */
  by: LeaderboardMetric;
  period: LeaderboardPeriod;
  /** First day of the period in the community time zone. "" for all time. */
  startDay: DayKey;
  /** When the period ends and the board starts over (server time). 0 for all time. */
  endsAt: number;
  entries: LeaderboardEntryDto[];
  /** The caller's own totals. rank is 0 when they're hidden or have nothing to rank yet. */
  me: { rank: number; focusMinutes: number; xp: number; hidden: boolean };
}

export interface RecapDto {
  day: DayKey;
  weekday: string;
  focusMinutes: number;
  goalsDone: number;
  activeMembers: number;
  boss: { name: string; hpLeftXp: number; daysLeft: number; defeated: boolean } | null;
  topStreaks: { userId: string; streak: number }[];
  /** Most focus minutes so far this week. Empty when the admin turned it off. */
  topFocus: { userId: string; focusMinutes: number }[];
}
