import type { BossState } from "../game/boss";
import type { StreakState } from "../game/streak";
import type { DayKey } from "../time/calendar";
import type { TimerPreset } from "../timer/presets";
import type { SquadEvent } from "../squad/squadLines";
import type {
  MyStatusDto,
  PersonalResultDto,
  PhaseCompletedDto,
  RecapDto,
  RoomStateDto,
} from "../dto";

// ---- Records the engine persists ----

export interface MemberRecord {
  userId: string;
  xpTotal: number;
  streak: StreakState;
  /** null = follow the community default. */
  goalsPrivate: boolean | null;
}

export interface GoalRecord {
  id: string;
  userId: string;
  text: string;
  done: boolean;
  /** Goal XP is granted once, so toggling a goal can't farm XP. */
  xpAwarded: boolean;
  createdAt: number;
  completedAt: number | null;
}

export interface SoloRecord {
  userId: string;
  startedAt: number;
  endsAt: number;
  minutes: number;
  phase: "focus" | "break";
  breakEndsAt: number;
  /** Base focus XP already dealt to the boss live, minute by minute, during this focus. */
  bossXpDealt: number;
  /** Whole focus minutes, and the XP for them, already credited live during this focus. */
  liveMinutes: number;
  liveXp: number;
}

export interface RoomCycleRecord {
  cycleStartedAt: number;
  /** Captured at cycle start; settings changes apply from the next cycle. */
  preset: TimerPreset;
  /** How many phases of this cycle have been settled. */
  settledCount: number;
}

export interface ParticipantRecord {
  userId: string;
  joinedAt: number;
  /** Tapped "Keep going?" this cycle, so the cycle end carries them into the next one. */
  keepGoing: boolean;
  /** Base focus XP already dealt to the boss live, minute by minute, in the current focus round. */
  bossXpDealt: number;
  /** Whole focus minutes, and the XP for them, already credited live in the current focus round. */
  liveMinutes: number;
  liveXp: number;
}

export interface SessionLogRecord {
  userId: string;
  kind: "room" | "solo";
  startedAt: number;
  endedAt: number;
  focusedMinutes: number;
  finished: boolean;
  xp: number;
  combo: number;
}

export interface DailyStatRecord {
  userId: string;
  day: DayKey;
  focusMinutes: number;
  xp: number;
  goalsDone: number;
  sessionsFinished: number;
}

export type DailyStatDelta = Partial<Omit<DailyStatRecord, "userId" | "day">>;

export interface WeekFocusRecord {
  userId: string;
  focusMinutes: number;
}

export interface XpTotalRecord {
  userId: string;
  xp: number;
}

/**
 * A leaderboard period: daily stats for [fromDay, toDay], and quest rewards
 * paid in [fromMs, toMs).
 */
export interface StandingsRange {
  fromDay: DayKey;
  toDay: DayKey;
  fromMs: number;
  toMs: number;
}

/** A weekly quest reward that has been paid, so it is paid only once. */
export interface QuestRewardRecord {
  userId: string;
  weekKey: DayKey;
  questId: string;
  xp: number;
  rewardedAt: number;
}

/** Sums over every daily_stats row a member has. */
export interface LifetimeStats {
  focusMinutes: number;
  goalsDone: number;
  sessionsFinished: number;
}

export interface EarnedBadgeRecord {
  userId: string;
  badgeId: string;
  earnedAt: number;
}

/** How a member's card looks. null means "automatic". */
export interface CardRecord {
  userId: string;
  style: string | null;
  showcase: string[] | null;
}

export interface CommunityDayStats {
  focusMinutes: number;
  goalsDone: number;
  activeMembers: number;
}

// ---- Persistence port ----

export interface Store {
  members: {
    get(userId: string): Promise<MemberRecord | undefined>;
    list(userIds: readonly string[]): Promise<MemberRecord[]>;
    listActiveSince(day: DayKey): Promise<MemberRecord[]>;
    save(member: MemberRecord): Promise<void>;
  };
  goals: {
    get(id: string): Promise<GoalRecord | undefined>;
    /** Open goals plus goals finished at or after `doneSince`, oldest first. */
    listForUser(userId: string, doneSince: number): Promise<GoalRecord[]>;
    /** Oldest open goal per user. */
    firstOpen(userIds: readonly string[]): Promise<Map<string, GoalRecord>>;
    countOpen(userId: string): Promise<number>;
    insert(goal: GoalRecord): Promise<void>;
    update(goal: GoalRecord): Promise<void>;
    delete(id: string): Promise<void>;
  };
  solos: {
    get(userId: string): Promise<SoloRecord | undefined>;
    list(): Promise<SoloRecord[]>;
    save(solo: SoloRecord): Promise<void>;
    delete(userId: string): Promise<void>;
  };
  room: {
    getCycle(): Promise<RoomCycleRecord | undefined>;
    saveCycle(cycle: RoomCycleRecord | null): Promise<void>;
    listParticipants(): Promise<ParticipantRecord[]>;
    addParticipant(participant: ParticipantRecord): Promise<void>;
    removeParticipant(userId: string): Promise<void>;
  };
  sessions: {
    insert(log: SessionLogRecord): Promise<void>;
    /** Sessions that ended in [fromMs, toMs), oldest first. */
    listForUser(userId: string, fromMs: number, toMs: number): Promise<SessionLogRecord[]>;
    countFinished(userId: string, kind: SessionLogRecord["kind"]): Promise<number>;
  };
  stats: {
    get(userId: string, day: DayKey): Promise<DailyStatRecord | undefined>;
    add(userId: string, day: DayKey, delta: DailyStatDelta): Promise<void>;
    listForUser(userId: string, fromDay: DayKey, toDay: DayKey): Promise<DailyStatRecord[]>;
    communityDay(day: DayKey): Promise<CommunityDayStats>;
    lifetime(userId: string): Promise<LifetimeStats>;
  };
  leaderboard: {
    isHidden(userId: string): Promise<boolean>;
    setHidden(userId: string, hidden: boolean): Promise<void>;
    listHidden(): Promise<string[]>;
    /**
     * Focus minutes per member summed over [fromDay, toDay], most first (ties
     * by user id). Members who are hidden or have no minutes are left out.
     */
    standings(fromDay: DayKey, toDay: DayKey): Promise<WeekFocusRecord[]>;
    /**
     * XP per member over the range: daily XP plus quest rewards paid in it,
     * most first (ties by user id). Members who are hidden or have no XP are
     * left out.
     */
    xpStandings(range: StandingsRange): Promise<XpTotalRecord[]>;
    /** One member's XP over the range, counted like xpStandings, hidden or not. */
    xpFor(userId: string, range: StandingsRange): Promise<number>;
  };
  quests: {
    /** Ids of the weekly quests whose reward the member has already received. */
    listRewarded(userId: string, weekKey: DayKey): Promise<string[]>;
    markRewarded(record: QuestRewardRecord): Promise<void>;
    /** Every weekly quest the member has finished, across all weeks. */
    countRewarded(userId: string): Promise<number>;
  };
  bosses: {
    get(weekKey: DayKey): Promise<BossState | undefined>;
    save(boss: BossState): Promise<void>;
    /** Defeated bosses the member contributed to. */
    countDefeatedWith(userId: string): Promise<number>;
  };
  badges: {
    /** Earned badges for these members, oldest first (ties by badge id). */
    list(userIds: readonly string[]): Promise<EarnedBadgeRecord[]>;
    /** Records a badge. Awarding one the member already has changes nothing. */
    award(record: EarnedBadgeRecord): Promise<void>;
  };
  cards: {
    list(userIds: readonly string[]): Promise<CardRecord[]>;
    save(card: CardRecord): Promise<void>;
  };
  kv: {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
  };
  /**
   * Removes every record about a member: profile, goals, sessions, daily
   * stats, quest rewards, room and solo timers, leaderboard opt-out, badges, card style, and their id in boss
   * contributor lists.
   * Community totals for past recaps are not recomputed.
   */
  eraseUser(userId: string): Promise<void>;
  /** Runs `work` atomically. Implementations must roll back if it throws. */
  transaction<T>(work: (tx: Store) => Promise<T>): Promise<T>;
}

// ---- Side-effect ports ----

export interface Clock {
  now(): number;
}

/** Holds at most one pending wake-up. Scheduling again replaces it. */
export interface WakeScheduler {
  wakeAt(at: number, callback: () => void): void;
  cancel(): void;
}

/** Pushes real-time updates to clients. Fire-and-forget. */
export interface Notifier {
  roomUpdated(room: RoomStateDto): void;
  phaseCompleted(event: PhaseCompletedDto): void;
  personalResult(userId: string, event: PersonalResultDto): void;
  myStatusUpdated(userId: string, me: MyStatusDto): void;
  /** Sent only to the member, once per operation, with every badge it earned them. */
  badgesEarned(userId: string, badgeIds: string[]): void;
}

/** Posts to a Root text channel. Failures are logged, never surfaced to users. */
export interface Announcer {
  busyRoom(channelId: string, focusingCount: number, combo: number): Promise<void>;
  streakMilestone(channelId: string, userId: string, streak: number): Promise<void>;
  bossDefeated(
    channelId: string,
    bossName: string,
    contributorCount: number,
    lootXp: number,
  ): Promise<void>;
  dailyRecap(channelId: string, recap: RecapDto): Promise<void>;
  /** A squad bot post: `text` from the line pools, addressed to (mentioning) `userIds`. */
  squadMessage(
    channelId: string,
    event: SquadEvent,
    text: string,
    userIds: string[],
  ): Promise<void>;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
