import { BUSY_POST_COOLDOWN_MS, GAME, LIMITS, MINUTE_MS } from "../constants";
import type {
  BossDto,
  CardLookDto,
  GoalDto,
  LeaderboardDto,
  LeaderboardMetric,
  LeaderboardPeriod,
  MemberCardDto,
  MemberProfileDto,
  MyStatusDto,
  PersonalResultDto,
  ProgressDto,
  QuestDto,
  RecapDto,
  RoomStateDto,
  RoomTimerDto,
  SnapshotDto,
} from "../dto";
import { conflictError, notFoundError, validationError } from "../errors";
import {
  applyDamage,
  bossHpLeft,
  bossLootXp,
  bossNameFor,
  bossStrength,
  newBoss,
  reconfigureBoss,
  type BossState,
} from "../game/boss";
import {
  badgeById,
  newlyEarnedBadges,
  type BadgeFacts,
  type QuestFacts,
  type SessionFacts,
} from "../game/badges";
import { comboFor } from "../game/combo";
import { questProgress, questsForWeek, QUESTS_PER_WEEK, type QuestProgress } from "../game/quests";
import {
  cardStyleById,
  isCardStyleUnlocked,
  resolveCardStyle,
  resolveShowcase,
  SHOWCASE_SIZE,
} from "../game/cosmetics";
import { currentStreak, EMPTY_STREAK, freezeAvailable, recordActiveDay } from "../game/streak";
import { applyDailyCap, baseFocusXp, focusXp, levelFromXp } from "../game/xp";
import type { AppConfig } from "../settings";
import {
  addDays,
  dayKey,
  daysBetween,
  localTime,
  monthKey,
  nextMonthStart,
  nextWeekStart,
  nextYearStart,
  startOfDay,
  weekdayName,
  weekKey,
  yearKey,
} from "../time/calendar";
import {
  buildCycle,
  keepGoingWindow,
  overlapMs,
  phaseAt,
  type CyclePhase,
} from "../timer/roomCycle";
import { SECRET_BADGE_NAME, type SquadEvent } from "../squad/squadLines";
import { pickSquadLine, type LastSquadLines } from "../squad/squadVoice";
import {
  validateGoalText,
  validateId,
  validateSoloMinutes,
  validateStartGoals,
} from "../validation";
import type {
  Announcer,
  CardRecord,
  Clock,
  EarnedBadgeRecord,
  GoalRecord,
  Logger,
  MemberRecord,
  Notifier,
  StandingsRange,
  ParticipantRecord,
  RoomCycleRecord,
  Store,
  WakeScheduler,
} from "./ports";
import { SerialQueue } from "./serialQueue";

export interface EngineDeps {
  store: Store;
  clock: Clock;
  scheduler: WakeScheduler;
  notifier: Notifier;
  announcer: Announcer;
  logger: Logger;
  config: AppConfig;
  newId: () => string;
  /** Returns [0, 1) like Math.random. Picks the squad bot's lines. */
  random: () => number;
}

export interface StartOptions {
  goals?: readonly unknown[];
  goalsPrivate?: boolean;
}

interface BusyPostState {
  armed: boolean;
  lastPostedAt: number;
}

const BUSY_KEY = "busyPost";
/** A focus block that hasn't credited or dealt anything live yet. */
const NO_LIVE_CREDIT = { bossXpDealt: 0, liveMinutes: 0, liveXp: 0 } as const;
const LAST_RECAP_KEY = "lastRecapDay";
/** The squad bot's last line per event, so it never says the same thing twice in a row. */
const SQUAD_LAST_KEY = "squadLastLines";
/** When the room last started from empty, for "studying together for 2 hours". */
const SQUAD_SESSION_KEY = "squadSessionStartedAt";
/** When each member's join was last announced. */
const SQUAD_JOINS_KEY = "squadJoinPosts";
/** A member's join is announced at most once in this long, so popping in and out stays quiet. */
const SQUAD_JOIN_COOLDOWN_MS = 2 * 60 * MINUTE_MS;
/**
 * A timer switch older than this is old news, say after the server was down,
 * so nobody gets pinged for a break that is nearly over.
 */
const SQUAD_STALE_MS = 2 * MINUTE_MS;
/** How long to wait before retrying a wake-up whose tick failed. */
const TICK_RETRY_MS = 30_000;

/**
 * Side effects collected while a transaction runs, released only after it
 * commits. A failed operation therefore never notifies anyone.
 */
class Effects {
  readonly notifications: Array<(notifier: Notifier) => void> = [];
  readonly posts: Array<(announcer: Announcer) => Promise<void>> = [];
  roomChanged = false;
  readonly statusChanged = new Set<string>();
  /** Badges earned during the operation, per member, pushed once it commits. */
  readonly badges = new Map<string, string[]>();
}

/** `me` with the badges its member earned in this operation, if any. */
function withNewBadges(me: MyStatusDto, effects: Effects): MyStatusDto {
  const earned = effects.badges.get(me.userId);
  return earned && earned.length > 0 ? { ...me, newBadges: [...earned] } : me;
}

function isMyStatus(value: unknown): value is MyStatusDto {
  return (
    typeof value === "object" &&
    value !== null &&
    "userId" in value &&
    "status" in value &&
    "goals" in value
  );
}

/**
 * Adds newly earned badges to an operation's own reply (a status or a
 * snapshot), so the caller sees them even if the separate push never arrives.
 */
function attachNewBadges(result: unknown, effects: Effects): void {
  if (effects.badges.size === 0) return;
  if (isMyStatus(result)) {
    const earned = effects.badges.get(result.userId);
    if (earned?.length) result.newBadges = [...earned];
  } else if (typeof result === "object" && result !== null && "me" in result) {
    const me = (result as { me: unknown }).me;
    if (isMyStatus(me)) {
      const earned = effects.badges.get(me.userId);
      if (earned?.length) me.newBadges = [...earned];
    }
  }
}

/**
 * All Study Squad behaviour lives here, behind ports for storage, time,
 * scheduling, real-time pushes and channel posts. The Root server and the
 * browser demo both run this same class with different adapters.
 */
export class StudyRoomEngine {
  private readonly queue = new SerialQueue();
  private readonly pendingPosts = new Set<Promise<void>>();
  private readonly present = new Set<string>();
  private readonly inVoice = new Set<string>();
  private config: AppConfig;
  private stopped = false;

  constructor(private readonly deps: EngineDeps) {
    this.config = deps.config;
  }

  // ---------------------------------------------------------------- lifecycle

  /** Settles anything that came due while the server was down, then schedules wake-ups. */
  start(): Promise<void> {
    this.stopped = false;
    return this.run(async () => undefined);
  }

  stop(): void {
    this.stopped = true;
    this.deps.scheduler.cancel();
  }

  /** Waits for queued operations and in-flight channel posts. Used by tests and shutdown. */
  async idle(): Promise<void> {
    await this.queue.drain();
    await Promise.all([...this.pendingPosts]);
  }

  tick(): Promise<void> {
    return this.run(async () => undefined);
  }

  setConfig(config: AppConfig): Promise<void> {
    return this.run(async (tx, now, effects) => {
      this.config = config;
      if (config.boss.enabled) {
        const boss = await this.loadBoss(tx, now);
        const name = bossNameFor(boss.weekKey, config.boss.name);
        const result = reconfigureBoss(boss, name, config.boss.baseHpXp, now);
        await tx.bosses.save(result.boss);
        if (result.defeatedNow) await this.onBossDefeated(tx, result.boss, effects);
      }
      effects.roomChanged = true;
    });
  }

  getConfig(): AppConfig {
    return this.config;
  }

  // ---------------------------------------------------------------- presence

  setPresence(userIds: readonly string[]): Promise<void> {
    this.present.clear();
    for (const id of userIds) this.present.add(id);
    return this.run(async (_tx, _now, effects) => {
      effects.roomChanged = true;
    });
  }

  userAttached(userId: string): Promise<void> {
    this.present.add(userId);
    return this.run(async (_tx, _now, effects) => {
      effects.roomChanged = true;
    });
  }

  userDetached(userId: string): Promise<void> {
    this.present.delete(userId);
    return this.run(async (_tx, _now, effects) => {
      effects.roomChanged = true;
    });
  }

  /** Who is in the configured voice channel. The server keeps this current. */
  setVoiceMembers(userIds: readonly string[]): Promise<void> {
    this.inVoice.clear();
    for (const id of userIds) this.inVoice.add(id);
    return this.run(async (_tx, _now, effects) => {
      effects.roomChanged = true;
    });
  }

  // ---------------------------------------------------------------- queries

  getSnapshot(userId: string): Promise<SnapshotDto> {
    return this.run(async (tx, now) => ({
      room: await this.buildRoomState(tx, now),
      me: await this.buildMyStatus(tx, userId, now),
    }));
  }

  getProgress(userId: string): Promise<ProgressDto> {
    return this.run(async (tx, now) => this.buildProgress(tx, userId, now));
  }

  /**
   * Another member's public stats, for the profile that opens when they're
   * tapped. Anyone in the community can look anyone up, so this returns game
   * stats only (see MemberProfileDto). Unknown members read as brand new.
   */
  async getMemberProfile(userIdInput: unknown): Promise<MemberProfileDto> {
    const userId = validateId(userIdInput, "member");
    return this.run(async (tx, now) => {
      const member = await tx.members.get(userId);
      const members = new Map(member ? [[userId, member]] : []);
      const progress = levelFromXp(member?.xpTotal ?? 0);
      const today = dayKey(now, this.config.timeZone);
      const look = (await this.cardLooks(tx, [userId], members)).get(userId)!;
      return {
        userId,
        level: progress.level,
        xpTotal: member?.xpTotal ?? 0,
        xpIntoLevel: progress.xpIntoLevel,
        xpForNextLevel: progress.xpForNextLevel,
        streak: member ? currentStreak(member.streak, today, this.config.streakFreezesEnabled) : 0,
        badges: (await tx.badges.list([userId])).map((b) => ({
          id: b.badgeId,
          earnedAt: b.earnedAt,
        })),
        showcase: look.showcase,
        cardStyle: look.style,
      };
    });
  }

  // ---------------------------------------------------------------- card looks

  /** Picks the card style other members see. "" goes back to automatic. */
  async setCardStyle(userId: string, styleInput: unknown): Promise<ProgressDto> {
    if (typeof styleInput !== "string") throw validationError("Pick a card style.");
    const style = styleInput === "" ? null : cardStyleById(styleInput);
    if (style === undefined) throw validationError("That card style doesn't exist.");
    return this.run(async (tx, now, effects) => {
      if (style) {
        const member = await this.loadMember(tx, userId);
        const held = new Set((await tx.badges.list([userId])).map((b) => b.badgeId));
        if (!isCardStyleUnlocked(style, levelFromXp(member.xpTotal).level, held)) {
          throw validationError(
            "level" in style.unlock
              ? `Reach level ${style.unlock.level} to unlock ${style.name}.`
              : `Earn the badge that unlocks ${style.name} first.`,
          );
        }
      }
      const card = await this.loadCard(tx, userId);
      await tx.cards.save({ ...card, style: style?.id ?? null });
      this.touch(effects, userId);
      return this.buildProgress(tx, userId, now);
    });
  }

  /** Picks up to three earned badges to show on the card. An empty list means "most recent". */
  async setBadgeShowcase(userId: string, badgeIdsInput: unknown): Promise<ProgressDto> {
    if (!Array.isArray(badgeIdsInput) || badgeIdsInput.some((id) => typeof id !== "string")) {
      throw validationError("Pick badges to show.");
    }
    const badgeIds = [...new Set(badgeIdsInput as string[])];
    if (badgeIds.length > SHOWCASE_SIZE) {
      throw validationError(`Pick up to ${SHOWCASE_SIZE} badges.`);
    }
    return this.run(async (tx, now, effects) => {
      const held = new Set((await tx.badges.list([userId])).map((b) => b.badgeId));
      if (badgeIds.some((id) => !held.has(id))) {
        throw validationError("You can only show badges you've earned.");
      }
      const card = await this.loadCard(tx, userId);
      await tx.cards.save({ ...card, showcase: badgeIds.length > 0 ? badgeIds : null });
      this.touch(effects, userId);
      return this.buildProgress(tx, userId, now);
    });
  }

  /** Standings for this week, month, year or all time by minutes or XP, plus where the caller stands. */
  async getLeaderboard(
    userId: string,
    by: unknown = "minutes",
    period: unknown = "week",
  ): Promise<LeaderboardDto> {
    const metric = validateMetric(by);
    const range = validatePeriod(period);
    return this.run(async (tx, now) => this.buildLeaderboard(tx, userId, now, metric, range));
  }

  /** Opting out hides the member from the leaderboard and from rankings in recaps. */
  async setLeaderboardHidden(
    userId: string,
    hidden: unknown,
    by: unknown = "minutes",
    period: unknown = "week",
  ): Promise<LeaderboardDto> {
    if (typeof hidden !== "boolean") throw validationError("Expected true or false.");
    const metric = validateMetric(by);
    const range = validatePeriod(period);
    return this.run(async (tx, now, effects) => {
      await tx.leaderboard.setHidden(userId, hidden);
      // Their rank chip on the board appears or goes away.
      this.touch(effects, userId);
      return this.buildLeaderboard(tx, userId, now, metric, range);
    });
  }

  // ---------------------------------------------------------------- room timer

  async joinRoomTimer(userId: string, options: StartOptions = {}): Promise<SnapshotDto> {
    const goals = validateStartGoals(options.goals ?? []);
    return this.run(async (tx, now, effects) => {
      const solo = await tx.solos.get(userId);
      if (solo?.phase === "focus") {
        throw conflictError("You're on a solo timer. End it to join the room timer.");
      }
      if (solo) await tx.solos.delete(userId);

      await this.applyStartOptions(tx, userId, goals, options.goalsPrivate, now);
      const participants = await tx.room.listParticipants();
      if (!participants.some((p) => p.userId === userId)) {
        const cycle = await tx.room.getCycle();
        if (!cycle) {
          await tx.room.saveCycle({
            cycleStartedAt: now,
            preset: this.config.preset,
            settledCount: 0,
          });
        }
        await tx.room.addParticipant({
          userId,
          joinedAt: now,
          keepGoing: false,
          ...NO_LIVE_CREDIT,
        });
        await this.announceJoin(tx, effects, userId, !cycle, now);
      }
      this.touch(effects, userId);
      await this.checkBusyRoom(tx, now, effects);
      return this.snapshot(tx, userId, now);
    });
  }

  leaveRoomTimer(userId: string): Promise<SnapshotDto> {
    return this.run(async (tx, now, effects) => {
      const participants = await tx.room.listParticipants();
      const me = participants.find((p) => p.userId === userId);
      const cycle = await tx.room.getCycle();
      if (me && cycle) {
        const phase = phaseAt(buildCycle(cycle.cycleStartedAt, cycle.preset), now);
        if (phase?.kind === "focus") {
          const minutes = overlapMs(me.joinedAt, now, phase.startsAt, phase.endsAt) / MINUTE_MS;
          const combo = comboFor(participants.length, this.config.comboEnabled);
          await this.creditFocus(tx, effects, {
            userId,
            kind: "room",
            startedAt: Math.max(me.joinedAt, phase.startsAt),
            endedAt: now,
            minutes,
            combo,
            finished: false,
            plannedMinutes: cycle.preset.focusMinutes,
            now,
            live: me,
          });
          // The base XP already hit the boss minute by minute; this adds the rest.
          const rest = focusXp(minutes, combo) - me.bossXpDealt;
          await this.damageBoss(tx, effects, rest, [userId], now);
        }
        await tx.room.removeParticipant(userId);
        if (participants.length === 1) await tx.room.saveCycle(null);
      }
      this.touch(effects, userId);
      await this.checkBusyRoom(tx, now, effects);
      return this.snapshot(tx, userId, now);
    });
  }

  // ---------------------------------------------------------------- solo timer

  async startSolo(
    userId: string,
    minutesInput: unknown,
    options: StartOptions = {},
  ): Promise<SnapshotDto> {
    const minutes = validateSoloMinutes(minutesInput);
    const goals = validateStartGoals(options.goals ?? []);
    return this.run(async (tx, now, effects) => {
      const participants = await tx.room.listParticipants();
      if (participants.some((p) => p.userId === userId)) {
        throw conflictError("You're on the room timer. Leave it to start a solo timer.");
      }
      const existing = await tx.solos.get(userId);
      if (existing?.phase === "focus") throw conflictError("Your solo timer is already running.");

      await this.applyStartOptions(tx, userId, goals, options.goalsPrivate, now);
      const endsAt = now + minutes * MINUTE_MS;
      await tx.solos.save({
        userId,
        startedAt: now,
        endsAt,
        minutes,
        phase: "focus",
        breakEndsAt: endsAt + this.config.preset.breakMinutes * MINUTE_MS,
        ...NO_LIVE_CREDIT,
      });
      this.touch(effects, userId);
      await this.checkBusyRoom(tx, now, effects);
      return this.snapshot(tx, userId, now);
    });
  }

  /** Stops a solo focus early (minutes so far still count) or skips the solo break. */
  endSolo(userId: string): Promise<SnapshotDto> {
    return this.run(async (tx, now, effects) => {
      const solo = await tx.solos.get(userId);
      if (solo?.phase === "focus") {
        const minutes = (now - solo.startedAt) / MINUTE_MS;
        await this.creditFocus(tx, effects, {
          userId,
          kind: "solo",
          startedAt: solo.startedAt,
          endedAt: now,
          minutes,
          combo: 1,
          finished: false,
          plannedMinutes: solo.minutes,
          now,
          live: solo,
        });
        const rest = focusXp(minutes, 1) - solo.bossXpDealt;
        await this.damageBoss(tx, effects, rest, [userId], now);
      }
      if (solo) await tx.solos.delete(userId);
      this.touch(effects, userId);
      await this.checkBusyRoom(tx, now, effects);
      return this.snapshot(tx, userId, now);
    });
  }

  /**
   * Answers "Keep going?" during the cycle's final long break, so the member
   * rolls into the next cycle instead of being released. A tap at any other
   * time changes nothing.
   */
  keepGoing(userId: string): Promise<MyStatusDto> {
    return this.run(async (tx, now, effects) => {
      const participant = (await tx.room.listParticipants()).find((p) => p.userId === userId);
      const cycle = await tx.room.getCycle();
      if (participant && cycle && this.keepGoingEndsAt(participant, cycle, now) > 0) {
        await tx.room.addParticipant({ ...participant, keepGoing: true });
        effects.statusChanged.add(userId);
      }
      return this.buildMyStatus(tx, userId, now);
    });
  }

  // ---------------------------------------------------------------- goals

  async addGoal(userId: string, textInput: unknown): Promise<MyStatusDto> {
    const text = validateGoalText(textInput);
    return this.run(async (tx, now, effects) => {
      await this.insertGoals(tx, userId, [text], now);
      this.touch(effects, userId);
      return this.buildMyStatus(tx, userId, now);
    });
  }

  async setGoalDone(userId: string, goalIdInput: unknown, done: unknown): Promise<MyStatusDto> {
    const goalId = validateId(goalIdInput, "goal id");
    if (typeof done !== "boolean") throw validationError("Expected true or false.");
    return this.run(async (tx, now, effects) => {
      const goal = await this.ownGoal(tx, userId, goalId);
      if (goal.done !== done) {
        const updated: GoalRecord = { ...goal, done, completedAt: done ? now : null };
        if (done && !goal.xpAwarded) {
          updated.xpAwarded = true;
          const day = dayKey(now, this.config.timeZone);
          const xp = this.config.xp.enabled
            ? applyDailyCap(
                GAME.xpPerGoal,
                (await tx.stats.get(userId, day))?.xp ?? 0,
                this.config.xp.dailyCap,
              )
            : 0;
          const member = await this.loadMember(tx, userId);
          await tx.members.save({ ...member, xpTotal: member.xpTotal + xp });
          await tx.stats.add(userId, day, { xp, goalsDone: 1 });
          // Goal XP hits the boss as earned, after the daily cap, so the boss
          // can't be farmed with tiny goals.
          await this.damageBoss(tx, effects, xp, [userId], now);
          const quests = await this.rewardQuests(tx, effects, userId, now);
          await this.awardBadges(tx, effects, userId, now, {
            goal: { secondsOpen: Math.floor((now - goal.createdAt) / 1000) },
            quests,
            ...(await this.activityFacts(tx, userId, day)),
          });
        }
        await tx.goals.update(updated);
      }
      this.touch(effects, userId);
      return this.buildMyStatus(tx, userId, now);
    });
  }

  async deleteGoal(userId: string, goalIdInput: unknown): Promise<MyStatusDto> {
    const goalId = validateId(goalIdInput, "goal id");
    return this.run(async (tx, now, effects) => {
      await this.ownGoal(tx, userId, goalId);
      await tx.goals.delete(goalId);
      this.touch(effects, userId);
      return this.buildMyStatus(tx, userId, now);
    });
  }

  async setGoalsPrivate(userId: string, goalsPrivate: unknown): Promise<MyStatusDto> {
    if (typeof goalsPrivate !== "boolean") throw validationError("Expected true or false.");
    return this.run(async (tx, now, effects) => {
      const member = await this.loadMember(tx, userId);
      await tx.members.save({ ...member, goalsPrivate });
      this.touch(effects, userId);
      return this.buildMyStatus(tx, userId, now);
    });
  }

  // ---------------------------------------------------------------- privacy

  /**
   * Erases everything Study Squad stores about the member, at their request.
   * Their card leaves the board at once, and the room timer goes idle if they
   * were the last one on it. No XP or minutes are credited for the session cut short.
   */
  deleteMyData(userId: string): Promise<MyStatusDto> {
    return this.run(async (tx, now, effects) => {
      const participants = await tx.room.listParticipants();
      if (participants.length === 1 && participants[0]!.userId === userId)
        await tx.room.saveCycle(null);
      await tx.eraseUser(userId);
      this.touch(effects, userId);
      this.deps.logger.info("member data erased", { userId });
      return this.buildMyStatus(tx, userId, now);
    });
  }

  // ---------------------------------------------------------------- daily recap

  /** Builds the recap for the community day containing `at`. */
  buildRecap(at?: number): Promise<RecapDto> {
    return this.run(async (tx, now) => this.recapFor(tx, at ?? now, now));
  }

  /** Posts today's recap once. Skips quiet days so the channel never reads "0 hours". */
  postDailyRecap(): Promise<boolean> {
    return this.run(async (tx, now, effects) => {
      const channelId = this.config.postChannelId;
      if (!this.config.recap.enabled || !channelId) return false;
      const day = dayKey(now, this.config.timeZone);
      if ((await tx.kv.get<string>(LAST_RECAP_KEY)) === day) return false;
      const recap = await this.recapFor(tx, now, now);
      if (recap.activeMembers === 0) return false;
      await tx.kv.set(LAST_RECAP_KEY, day);
      effects.posts.push((a) => a.dailyRecap(channelId, recap));
      return true;
    });
  }

  // ================================================================ internals

  /**
   * Every public operation goes through here: serialised, settled up to "now",
   * run in one transaction, then side effects released and the next wake-up set.
   */
  private run<T>(work: (tx: Store, now: number, effects: Effects) => Promise<T>): Promise<T> {
    return this.queue.run(async () => {
      const now = this.deps.clock.now();
      const effects = new Effects();
      const { result, nextWake } = await this.deps.store.transaction(async (tx) => {
        await this.settleDue(tx, now, effects);
        const result = await work(tx, now, effects);
        if (effects.roomChanged) {
          const room = await this.buildRoomState(tx, now);
          effects.notifications.push((n) => n.roomUpdated(room));
        }
        for (const userId of effects.statusChanged) {
          const me = withNewBadges(await this.buildMyStatus(tx, userId, now), effects);
          effects.notifications.push((n) => n.myStatusUpdated(userId, me));
        }
        for (const [userId, badgeIds] of effects.badges) {
          effects.notifications.push((n) => n.badgesEarned(userId, badgeIds));
          await this.announceBadges(tx, effects, userId, badgeIds, now);
        }
        attachNewBadges(result, effects);
        return { result, nextWake: await this.nextWakeAt(tx, now) };
      });
      this.release(effects);
      this.schedule(nextWake);
      return result;
    });
  }

  private release(effects: Effects): void {
    for (const notify of effects.notifications) {
      try {
        notify(this.deps.notifier);
      } catch (error) {
        this.deps.logger.error("notify failed", { error: String(error) });
      }
    }
    for (const post of effects.posts) {
      const pending = post(this.deps.announcer)
        .catch((error: unknown) =>
          this.deps.logger.warn("channel post failed", { error: String(error) }),
        )
        .finally(() => this.pendingPosts.delete(pending));
      this.pendingPosts.add(pending);
    }
  }

  private schedule(at: number | null): void {
    if (at === null) {
      this.deps.scheduler.cancel();
      return;
    }
    this.deps.scheduler.wakeAt(at, () => this.wake());
  }

  /**
   * A failed tick (say, the database was briefly locked) schedules nothing,
   * so without a retry the room timer would stall until someone acts.
   */
  private wake(): void {
    this.tick().catch((error: unknown) => {
      this.deps.logger.error("tick failed", { error: String(error) });
      if (this.stopped) return;
      this.deps.scheduler.wakeAt(this.deps.clock.now() + TICK_RETRY_MS, () => this.wake());
    });
  }

  private touch(effects: Effects, userId: string): void {
    effects.roomChanged = true;
    effects.statusChanged.add(userId);
  }

  private async snapshot(tx: Store, userId: string, now: number): Promise<SnapshotDto> {
    return {
      room: await this.buildRoomState(tx, now),
      me: await this.buildMyStatus(tx, userId, now),
    };
  }

  // ---------------------------------------------------------------- settling

  private async settleDue(tx: Store, now: number, effects: Effects): Promise<void> {
    await this.settleRoomCycle(tx, now, effects);
    await this.settleSolos(tx, now, effects);
    await this.creditLiveFocus(tx, now, effects);
    await this.dealLiveDamage(tx, now, effects);
  }

  /**
   * Study minutes and XP count as they happen: each whole minute of a running
   * focus block adds its minutes and base XP (under the daily cap) right away,
   * so the leaderboard, quests, levels and the board's ranks move every
   * minute. The end of the block adds the rest, including the combo bonus.
   */
  private async creditLiveFocus(tx: Store, now: number, effects: Effects): Promise<void> {
    const cycle = await tx.room.getCycle();
    const phase = cycle ? phaseAt(buildCycle(cycle.cycleStartedAt, cycle.preset), now) : undefined;
    if (phase?.kind === "focus") {
      for (const p of await tx.room.listParticipants()) {
        const minutes = overlapMs(p.joinedAt, now, phase.startsAt, phase.endsAt) / MINUTE_MS;
        const credited = await this.creditLiveMinutes(tx, effects, p, minutes, now);
        if (credited) await tx.room.addParticipant({ ...p, ...credited });
      }
    }
    for (const solo of await tx.solos.list()) {
      if (solo.phase !== "focus") continue;
      const minutes = (Math.min(now, solo.endsAt) - solo.startedAt) / MINUTE_MS;
      const credited = await this.creditLiveMinutes(tx, effects, solo, minutes, now);
      if (credited) await tx.solos.save({ ...solo, ...credited });
    }
  }

  /** Credits the block's new whole minutes. Returns its updated live totals, or null if none. */
  private async creditLiveMinutes(
    tx: Store,
    effects: Effects,
    block: { userId: string; liveMinutes: number; liveXp: number },
    minutes: number,
    now: number,
  ): Promise<{ liveMinutes: number; liveXp: number } | null> {
    const whole = Math.floor(minutes);
    const newMinutes = whole - block.liveMinutes;
    if (newMinutes <= 0) return null;
    const { userId } = block;
    const day = dayKey(now, this.config.timeZone);
    const xpToday = (await tx.stats.get(userId, day))?.xp ?? 0;
    const rawXp = this.config.xp.enabled ? baseFocusXp(whole) - baseFocusXp(block.liveMinutes) : 0;
    const xp = applyDailyCap(rawXp, xpToday, this.config.xp.dailyCap);
    if (xp > 0) {
      const member = await this.loadMember(tx, userId);
      await tx.members.save({ ...member, xpTotal: member.xpTotal + xp });
    }
    await tx.stats.add(userId, day, { focusMinutes: newMinutes, xp });
    const quests = await this.rewardQuests(tx, effects, userId, now);
    await this.awardBadges(tx, effects, userId, now, {
      quests,
      ...(await this.activityFacts(tx, userId, day)),
    });
    this.touch(effects, userId);
    return { liveMinutes: whole, liveXp: block.liveXp + xp };
  }

  /**
   * Focus hits the boss as it happens: each whole minute of a running focus
   * block deals its base XP. The combo bonus lands when the round ends, since
   * the combo depends on who finishes. Each block remembers what it has dealt,
   * so the end of the block only deals the rest.
   */
  private async dealLiveDamage(tx: Store, now: number, effects: Effects): Promise<void> {
    if (!this.config.boss.enabled) return;
    const cycle = await tx.room.getCycle();
    const phase = cycle ? phaseAt(buildCycle(cycle.cycleStartedAt, cycle.preset), now) : undefined;
    if (phase?.kind === "focus") {
      for (const p of await tx.room.listParticipants()) {
        const minutes = overlapMs(p.joinedAt, now, phase.startsAt, phase.endsAt) / MINUTE_MS;
        const hit = baseFocusXp(minutes) - p.bossXpDealt;
        if (hit <= 0) continue;
        await tx.room.addParticipant({ ...p, bossXpDealt: p.bossXpDealt + hit });
        await this.damageBoss(tx, effects, hit, [p.userId], now);
      }
    }
    for (const solo of await tx.solos.list()) {
      if (solo.phase !== "focus") continue;
      const minutes = (Math.min(now, solo.endsAt) - solo.startedAt) / MINUTE_MS;
      const hit = baseFocusXp(minutes) - solo.bossXpDealt;
      if (hit <= 0) continue;
      await tx.solos.save({ ...solo, bossXpDealt: solo.bossXpDealt + hit });
      await this.damageBoss(tx, effects, hit, [solo.userId], now);
    }
  }

  private async settleRoomCycle(tx: Store, now: number, effects: Effects): Promise<void> {
    const cycle = await tx.room.getCycle();
    if (!cycle) return;
    const phases = buildCycle(cycle.cycleStartedAt, cycle.preset);
    let settled = cycle.settledCount;
    while (settled < phases.length && phases[settled]!.endsAt <= now) {
      const phase = phases[settled]!;
      if (phase.kind === "focus") {
        await this.settleFocusPhase(tx, phases, phase, cycle.preset.focusMinutes, effects);
      }
      if (phase.endsAt === keepGoingWindow(phases).opensAt) {
        // The long break starts: push "Keep going?" to everyone who focused this cycle.
        for (const p of await tx.room.listParticipants()) effects.statusChanged.add(p.userId);
      }
      settled++;
      effects.roomChanged = true;
    }
    if (settled < phases.length) {
      if (settled !== cycle.settledCount) {
        await tx.room.saveCycle({ ...cycle, settledCount: settled });
        await this.announcePhase(tx, phases[settled]!, now, effects);
      }
      return;
    }
    if (await this.finishCycle(tx, phases, effects)) {
      const next = await tx.room.getCycle();
      if (next) {
        await this.announcePhase(
          tx,
          buildCycle(next.cycleStartedAt, next.preset)[0]!,
          now,
          effects,
        );
      }
      await this.settleRoomCycle(tx, now, effects);
    }
  }

  /** The squad bot tells everyone in the room that the clock just switched to `phase`. */
  private async announcePhase(
    tx: Store,
    phase: CyclePhase,
    now: number,
    effects: Effects,
  ): Promise<void> {
    if (now - phase.startsAt >= SQUAD_STALE_MS || now >= phase.endsAt) return;
    const event: SquadEvent =
      phase.kind === "break"
        ? "breakStarted"
        : phase.kind === "longBreak"
          ? "sessionCompleted"
          : "studyResumed";
    const userIds = (await tx.room.listParticipants()).map((p) => p.userId);
    await this.squadMessage(tx, effects, event, userIds, phase.round, now);
  }

  /**
   * Picks and queues a squad bot post. It goes out once from here, after the
   * transaction commits, however many devices the members have connected.
   */
  private async squadMessage(
    tx: Store,
    effects: Effects,
    event: SquadEvent,
    userIds: string[],
    round: number,
    now: number,
    badge?: string,
  ): Promise<void> {
    const channelId = this.config.postChannelId;
    if (!this.config.squadBot.enabled || !channelId || userIds.length === 0) return;
    const last = (await tx.kv.get<LastSquadLines>(SQUAD_LAST_KEY)) ?? {};
    const startedAt = (await tx.kv.get<number>(SQUAD_SESSION_KEY)) ?? now;
    const line = pickSquadLine(event, this.config.squadBot.personalities, last, this.deps.random, {
      round,
      togetherMinutes: Math.max(0, now - startedAt) / MINUTE_MS,
      badge,
    });
    await tx.kv.set(SQUAD_LAST_KEY, {
      ...last,
      ...(line.rare ? { rare: line.id } : { [event]: line.id }),
    });
    effects.posts.push((a) => a.squadMessage(channelId, event, line.text, userIds));
  }

  /** The squad bot congratulates a member on badges they just earned, in one post. */
  private async announceBadges(
    tx: Store,
    effects: Effects,
    userId: string,
    badgeIds: readonly string[],
    now: number,
  ): Promise<void> {
    const names = [
      ...new Set(
        badgeIds.map((id) => {
          const badge = badgeById(id);
          return !badge || badge.secret ? SECRET_BADGE_NAME : badge.name;
        }),
      ),
    ];
    const badge =
      names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
    await this.squadMessage(tx, effects, "badgeUnlocked", [userId], 0, now, badge);
  }

  /**
   * Announces a member joining the room. Starting an empty room is always
   * announced; joining a running one at most once per cool-down per member.
   */
  private async announceJoin(
    tx: Store,
    effects: Effects,
    userId: string,
    startedRoom: boolean,
    now: number,
  ): Promise<void> {
    const joins = (await tx.kv.get<Record<string, number>>(SQUAD_JOINS_KEY)) ?? {};
    const recentlyAnnounced = now - (joins[userId] ?? -Infinity) < SQUAD_JOIN_COOLDOWN_MS;
    if (recentlyAnnounced && !startedRoom) return;
    // Forget old entries so the record stays small.
    const recent = Object.fromEntries(
      Object.entries(joins).filter(([, at]) => now - at < SQUAD_JOIN_COOLDOWN_MS),
    );
    await tx.kv.set(SQUAD_JOINS_KEY, { ...recent, [userId]: now });
    if (startedRoom) await tx.kv.set(SQUAD_SESSION_KEY, now);
    const event = startedRoom ? "sessionStarted" : "memberJoined";
    await this.squadMessage(tx, effects, event, [userId], 1, now);
  }

  /**
   * At the end of a cycle, only people who tapped "Keep going?" roll into a
   * fresh cycle, so nobody can leave a timer running for hours. Everyone else
   * is released and keeps everything they earned. People who joined during
   * the final long break haven't focused yet, so they roll over too.
   */
  private async finishCycle(tx: Store, phases: CyclePhase[], effects: Effects): Promise<boolean> {
    const { opensAt: lastFocusEnd, closesAt: end } = keepGoingWindow(phases);
    const participants = await tx.room.listParticipants();
    const carried = participants.filter((p) => p.keepGoing || p.joinedAt >= lastFocusEnd);
    for (const p of participants) {
      if (!carried.includes(p)) {
        await tx.room.removeParticipant(p.userId);
        effects.statusChanged.add(p.userId);
      }
    }
    await tx.room.saveCycle(
      carried.length > 0
        ? { cycleStartedAt: end, preset: this.config.preset, settledCount: 0 }
        : null,
    );
    for (const p of carried) {
      await tx.room.addParticipant({ ...p, joinedAt: end, keepGoing: false, ...NO_LIVE_CREDIT });
      effects.statusChanged.add(p.userId);
    }
    effects.roomChanged = true;
    // Returns true when a new cycle started, which may itself be overdue after downtime.
    return carried.length > 0;
  }

  private async settleFocusPhase(
    tx: Store,
    phases: readonly CyclePhase[],
    phase: CyclePhase,
    focusMinutes: number,
    effects: Effects,
  ): Promise<void> {
    const participants = await tx.room.listParticipants();
    const minuteShares = participants
      .map((p) => ({
        participant: p,
        minutes: overlapMs(p.joinedAt, phase.endsAt, phase.startsAt, phase.endsAt) / MINUTE_MS,
      }))
      .filter((s) => s.minutes > 0);
    const finishThreshold = Math.min(GAME.minRoundMinutesToFinish, focusMinutes / 2);
    const finisherIds = minuteShares
      .filter((s) => s.minutes >= finishThreshold)
      .map((s) => s.participant.userId);
    const combo = comboFor(finisherIds.length, this.config.comboEnabled);
    // Damage is the XP the round earns before the daily cap, so capped members still hit the boss.
    const roomDamageXp = minuteShares.reduce((sum, s) => sum + focusXp(s.minutes, combo), 0);
    // Stayed for the whole cycle: this is its last round and they finished round 1 too.
    const focusPhases = phases.filter((p) => p.kind === "focus");
    const lastRound = focusPhases.at(-1)?.index === phase.index;
    const firstRoundEnd = focusPhases[0]?.endsAt ?? phase.endsAt;
    const fullCycle = (joinedAt: number) =>
      lastRound && joinedAt <= firstRoundEnd - finishThreshold * MINUTE_MS;

    const credits = [];
    for (const share of minuteShares) {
      credits.push({
        share,
        credit: await this.creditFocus(tx, effects, {
          userId: share.participant.userId,
          kind: "room",
          startedAt: Math.max(share.participant.joinedAt, phase.startsAt),
          endedAt: phase.endsAt,
          minutes: share.minutes,
          combo,
          finished: finisherIds.includes(share.participant.userId),
          plannedMinutes: focusMinutes,
          fullCycle: fullCycle(share.participant.joinedAt),
          now: phase.endsAt,
          live: share.participant,
        }),
      });
    }
    // Base XP already hit the boss minute by minute; the round's end deals the
    // rest, including the combo bonus, then each participant starts the next
    // round at zero.
    const rest = minuteShares.reduce(
      (sum, s) => sum + Math.max(0, focusXp(s.minutes, combo) - s.participant.bossXpDealt),
      0,
    );
    await this.damageBoss(
      tx,
      effects,
      rest,
      minuteShares.map((s) => s.participant.userId),
      phase.endsAt,
    );
    for (const p of participants) {
      if (p.bossXpDealt !== 0 || p.liveMinutes !== 0 || p.liveXp !== 0)
        await tx.room.addParticipant({ ...p, ...NO_LIVE_CREDIT });
    }

    const breakEndsAt = phases[phase.index + 1]?.endsAt ?? phase.endsAt;
    const room = await this.buildRoomState(tx, phase.endsAt);
    effects.notifications.push((n) =>
      n.phaseCompleted({
        kind: phase.kind,
        round: phase.round,
        finisherIds,
        roomDamageXp,
        combo,
        room,
      }),
    );
    for (const { share, credit } of credits) {
      const userId = share.participant.userId;
      const result: PersonalResultDto = {
        source: "room",
        round: phase.round,
        focusedMinutes: share.minutes,
        finished: finisherIds.includes(userId),
        baseXp: credit.baseXp,
        combo,
        xpEarned: credit.xpEarned,
        capped: credit.capped,
        streak: credit.streak,
        streakExtended: credit.streakExtended,
        finisherIds,
        roomDamageXp,
        goalPrompt: await this.goalPrompt(tx, userId),
        breakEndsAt,
        me: withNewBadges(await this.buildMyStatus(tx, userId, phase.endsAt), effects),
      };
      effects.notifications.push((n) => n.personalResult(userId, result));
    }
  }

  private async settleSolos(tx: Store, now: number, effects: Effects): Promise<void> {
    for (const solo of await tx.solos.list()) {
      if (solo.phase === "focus" && solo.endsAt <= now) {
        const credit = await this.creditFocus(tx, effects, {
          userId: solo.userId,
          kind: "solo",
          startedAt: solo.startedAt,
          endedAt: solo.endsAt,
          minutes: solo.minutes,
          combo: 1,
          finished: true,
          plannedMinutes: solo.minutes,
          now: solo.endsAt,
          live: solo,
        });
        const damageXp = focusXp(solo.minutes, 1);
        const rest = damageXp - solo.bossXpDealt;
        await this.damageBoss(tx, effects, rest, [solo.userId], solo.endsAt);
        const stillOnBreak = solo.breakEndsAt > now;
        if (stillOnBreak) await tx.solos.save({ ...solo, phase: "break", ...NO_LIVE_CREDIT });
        else await tx.solos.delete(solo.userId);
        const result: PersonalResultDto = {
          source: "solo",
          round: 0,
          focusedMinutes: solo.minutes,
          finished: true,
          baseXp: credit.baseXp,
          combo: 1,
          xpEarned: credit.xpEarned,
          capped: credit.capped,
          streak: credit.streak,
          streakExtended: credit.streakExtended,
          finisherIds: [solo.userId],
          roomDamageXp: damageXp,
          goalPrompt: await this.goalPrompt(tx, solo.userId),
          breakEndsAt: solo.breakEndsAt,
          me: withNewBadges(await this.buildMyStatus(tx, solo.userId, now), effects),
        };
        effects.notifications.push((n) => n.personalResult(solo.userId, result));
        this.touch(effects, solo.userId);
      } else if (solo.phase === "break" && solo.breakEndsAt <= now) {
        await tx.solos.delete(solo.userId);
        this.touch(effects, solo.userId);
      }
    }
  }

  private async nextWakeAt(tx: Store, now: number): Promise<number | null> {
    const candidates: number[] = [];
    const cycle = await tx.room.getCycle();
    if (cycle) {
      const next = buildCycle(cycle.cycleStartedAt, cycle.preset)[cycle.settledCount];
      if (next) candidates.push(next.endsAt);
    }
    for (const solo of await tx.solos.list()) {
      candidates.push(solo.phase === "focus" ? solo.endsAt : solo.breakEndsAt);
    }
    // Wake when the week rolls over so everyone sees the new boss.
    if (this.config.boss.enabled && candidates.length > 0) {
      candidates.push(nextWeekStart(now, this.config.timeZone));
    }
    // While anyone is focusing, wake every minute so stats and the boss update live.
    if (await this.anyoneFocusing(tx, now)) {
      candidates.push((Math.floor(now / MINUTE_MS) + 1) * MINUTE_MS);
    }
    return candidates.length > 0 ? Math.min(...candidates) : null;
  }

  private async anyoneFocusing(tx: Store, now: number): Promise<boolean> {
    if ((await tx.solos.list()).some((s) => s.phase === "focus")) return true;
    const cycle = await tx.room.getCycle();
    if (!cycle || (await tx.room.listParticipants()).length === 0) return false;
    return phaseAt(buildCycle(cycle.cycleStartedAt, cycle.preset), now)?.kind === "focus";
  }

  // ---------------------------------------------------------------- rewards

  private async creditFocus(
    tx: Store,
    effects: Effects,
    input: {
      userId: string;
      kind: "room" | "solo";
      startedAt: number;
      endedAt: number;
      minutes: number;
      combo: number;
      finished: boolean;
      /** What the timer was set to, for badges. */
      plannedMinutes: number;
      fullCycle?: boolean;
      now: number;
      /** What this block already credited live, minute by minute. Only the rest is added. */
      live?: { liveMinutes: number; liveXp: number };
    },
  ) {
    const { userId, minutes, combo, finished, now } = input;
    const live = input.live ?? { liveMinutes: 0, liveXp: 0 };
    const day = dayKey(now, this.config.timeZone);
    const member = await this.loadMember(tx, userId);
    const xpToday = (await tx.stats.get(userId, day))?.xp ?? 0;
    const rawXp = this.config.xp.enabled ? focusXp(minutes, combo) : 0;
    // Live ticks paid base XP for whole minutes; the end pays the rest,
    // including the combo bonus, under whatever room the daily cap has left.
    const liveRawXp = this.config.xp.enabled ? baseFocusXp(live.liveMinutes) : 0;
    const restXp = applyDailyCap(Math.max(0, rawXp - liveRawXp), xpToday, this.config.xp.dailyCap);
    const xpEarned = live.liveXp + restXp;

    let streak = member.streak;
    let streakExtended = false;
    let freezesSpent = 0;
    if (finished) {
      const update = recordActiveDay(member.streak, day, this.config.streakFreezesEnabled);
      streak = update.state;
      streakExtended = update.extended;
      freezesSpent = update.freezesSpent;
    }
    // A streak that restarted at 1 after an earlier one: that earlier one was broken.
    const comebackFrom =
      streakExtended && streak.streak === 1 && member.streak.lastActiveDay !== null
        ? member.streak.streak
        : 0;
    await tx.members.save({ ...member, xpTotal: member.xpTotal + restXp, streak });
    await tx.stats.add(userId, day, {
      focusMinutes: Math.max(0, minutes - live.liveMinutes),
      xp: restXp,
      sessionsFinished: finished ? 1 : 0,
    });
    await tx.sessions.insert({
      userId,
      kind: input.kind,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      focusedMinutes: minutes,
      finished,
      xp: xpEarned,
      combo,
    });
    const quests = await this.rewardQuests(tx, effects, userId, now);

    const tz = this.config.timeZone;
    const session: SessionFacts = {
      kind: input.kind,
      finished,
      minutes: Math.floor(minutes),
      plannedMinutes: input.plannedMinutes,
      combo,
      start: localTime(input.startedAt, tz),
      end: localTime(input.endedAt, tz),
      fullCycle: finished && input.fullCycle === true,
    };
    await this.awardBadges(tx, effects, userId, now, {
      session,
      streak: { length: streak.streak, comebackFrom, freezeSaved: freezesSpent > 0 },
      leaderboard: { rank: await this.weeklyRank(tx, userId, day) },
      quests,
      ...(await this.activityFacts(tx, userId, day)),
    });

    const channelId = this.config.postChannelId;
    if (
      streakExtended &&
      channelId &&
      this.config.milestonePostsEnabled &&
      GAME.streakMilestones.includes(streak.streak)
    ) {
      const length = streak.streak;
      effects.posts.push((a) => a.streakMilestone(channelId, userId, length));
    }

    return {
      baseXp: this.config.xp.enabled ? baseFocusXp(minutes) : 0,
      xpEarned,
      capped: xpEarned < rawXp,
      streak: streak.streak,
      streakExtended,
    };
  }

  private async damageBoss(
    tx: Store,
    effects: Effects,
    xp: number,
    contributorIds: readonly string[],
    now: number,
  ): Promise<void> {
    if (!this.config.boss.enabled || xp <= 0) return;
    const boss = await this.loadBoss(tx, now);
    const result = applyDamage(boss, xp, contributorIds, now);
    if (result.boss === boss) return;
    await tx.bosses.save(result.boss);
    effects.roomChanged = true;
    if (result.defeatedNow) await this.onBossDefeated(tx, result.boss, effects, contributorIds);
  }

  /**
   * Loot: every contributor gets bonus XP scaled by the boss's strength,
   * outside the daily cap because it happens once a week.
   */
  private async onBossDefeated(
    tx: Store,
    boss: BossState,
    effects: Effects,
    finalBlowIds: readonly string[] = [],
  ): Promise<void> {
    const lootXp = this.config.xp.enabled ? bossLootXp(boss.name) : 0;
    if (lootXp > 0) {
      for (const member of await tx.members.list(boss.contributorIds)) {
        await tx.members.save({ ...member, xpTotal: member.xpTotal + lootXp });
        effects.statusChanged.add(member.userId);
      }
    }
    const defeatedAt = boss.defeatedAt ?? this.deps.clock.now();
    for (const userId of boss.contributorIds) {
      await this.awardBadges(tx, effects, userId, defeatedAt, {
        boss: {
          name: boss.name,
          strength: bossStrength(boss.name),
          defeats: await tx.bosses.countDefeatedWith(userId),
          contributors: boss.contributorIds.length,
          finalBlow: finalBlowIds.includes(userId),
          at: localTime(defeatedAt, this.config.timeZone),
        },
      });
    }
    effects.roomChanged = true;
    const channelId = this.config.postChannelId;
    if (channelId) {
      effects.posts.push((a) =>
        a.bossDefeated(channelId, boss.name, boss.contributorIds.length, lootXp),
      );
    }
  }

  /**
   * Pays the reward for every quest the member has just finished this week.
   * Like boss loot it is outside the daily cap: it comes at most three times
   * a week, and a capped reward would often be zero. The reward also hits the
   * boss. Returns the quest facts badges look at.
   */
  private async rewardQuests(
    tx: Store,
    effects: Effects,
    userId: string,
    now: number,
  ): Promise<QuestFacts> {
    const week = weekKey(dayKey(now, this.config.timeZone));
    const rewarded = new Set(await tx.quests.listRewarded(userId, week));
    let xp = 0;
    for (const { quest, done } of await this.weeklyQuests(tx, userId, now)) {
      if (!done || rewarded.has(quest.id)) continue;
      const questXp = this.config.xp.enabled ? quest.xp : 0;
      await tx.quests.markRewarded({
        userId,
        weekKey: week,
        questId: quest.id,
        xp: questXp,
        rewardedAt: now,
      });
      rewarded.add(quest.id);
      xp += questXp;
    }
    if (xp > 0) {
      const member = await this.loadMember(tx, userId);
      await tx.members.save({ ...member, xpTotal: member.xpTotal + xp });
      await this.damageBoss(tx, effects, xp, [userId], now);
    }
    return {
      doneThisWeek: rewarded.size,
      perWeek: QUESTS_PER_WEEK,
      totalDone: await tx.quests.countRewarded(userId),
    };
  }

  /** This week's quests and the member's progress, from daily_stats and session_log. */
  private async weeklyQuests(tx: Store, userId: string, now: number): Promise<QuestProgress[]> {
    const tz = this.config.timeZone;
    const week = weekKey(dayKey(now, tz));
    const days = await tx.stats.listForUser(userId, week, addDays(week, 6));
    const sessions = await tx.sessions.listForUser(
      userId,
      startOfDay(week, tz),
      startOfDay(addDays(week, 7), tz),
    );
    return questsForWeek(week).map((quest) => questProgress(quest, { days, sessions }));
  }

  private questDto({ quest, progress, done }: QuestProgress): QuestDto {
    return {
      id: quest.id,
      title: quest.title,
      progress,
      target: quest.target,
      unit: quest.unit,
      xp: this.config.xp.enabled ? quest.xp : 0,
      done,
    };
  }

  // ---------------------------------------------------------------- badges

  /**
   * Awards every badge these facts newly earn. XP and level are read here,
   * after the operation's own XP has been saved, so level badges always see
   * the latest total. Focus blocks also pass the weekly leaderboard rank.
   */
  private async awardBadges(
    tx: Store,
    effects: Effects,
    userId: string,
    now: number,
    facts: Omit<BadgeFacts, "xpTotal" | "level">,
  ): Promise<void> {
    const member = await this.loadMember(tx, userId);
    const held = new Set((await tx.badges.list([userId])).map((b) => b.badgeId));
    const earned = newlyEarnedBadges(
      { ...facts, xpTotal: member.xpTotal, level: levelFromXp(member.xpTotal).level },
      held,
    );
    if (earned.length === 0) return;
    for (const badgeId of earned) await tx.badges.award({ userId, badgeId, earnedAt: now });
    effects.badges.set(userId, [...(effects.badges.get(userId) ?? []), ...earned]);
    // The card may show the new badge.
    this.touch(effects, userId);
  }

  /**
   * The member's place on this week's leaderboard, for badges. 0 when they're
   * hidden, unranked, or too few members are ranked for a place to mean much.
   */
  private async weeklyRank(tx: Store, userId: string, day: string): Promise<number> {
    const ranked = rankByMinutes(await tx.leaderboard.standings(weekKey(day), day));
    if (ranked.length < LIMITS.leaderboardBadgeMinRanked) return 0;
    return ranked.find((e) => e.userId === userId)?.rank ?? 0;
  }

  /** Today's and all-time totals, for badges. */
  private async activityFacts(
    tx: Store,
    userId: string,
    day: string,
  ): Promise<Pick<BadgeFacts, "today" | "lifetime">> {
    const today = await tx.stats.get(userId, day);
    const lifetime = await tx.stats.lifetime(userId);
    return {
      today: {
        day,
        focusMinutes: today?.focusMinutes ?? 0,
        sessionsFinished: today?.sessionsFinished ?? 0,
        goalsDone: today?.goalsDone ?? 0,
      },
      lifetime: {
        ...lifetime,
        roomRoundsFinished: await tx.sessions.countFinished(userId, "room"),
      },
    };
  }

  private async checkBusyRoom(tx: Store, now: number, effects: Effects): Promise<void> {
    const { enabled, threshold } = this.config.busyPosts;
    const channelId = this.config.postChannelId;
    if (!enabled || !channelId) return;
    const room = await this.buildRoomState(tx, now);
    const focusing = room.members.filter(
      (m) => m.status === "roomFocus" || m.status === "soloFocus",
    ).length;
    const state = (await tx.kv.get<BusyPostState>(BUSY_KEY)) ?? { armed: true, lastPostedAt: 0 };
    if (focusing < threshold) {
      if (!state.armed) await tx.kv.set(BUSY_KEY, { ...state, armed: true });
      return;
    }
    if (!state.armed || now - state.lastPostedAt < BUSY_POST_COOLDOWN_MS) return;
    await tx.kv.set(BUSY_KEY, { armed: false, lastPostedAt: now });
    const combo = room.combo;
    effects.posts.push((a) => a.busyRoom(channelId, focusing, combo));
  }

  // ---------------------------------------------------------------- loading

  private async loadMember(tx: Store, userId: string): Promise<MemberRecord> {
    return (
      (await tx.members.get(userId)) ?? {
        userId,
        xpTotal: 0,
        streak: EMPTY_STREAK,
        goalsPrivate: null,
      }
    );
  }

  private async loadCard(tx: Store, userId: string): Promise<CardRecord> {
    return (await tx.cards.list([userId]))[0] ?? { userId, style: null, showcase: null };
  }

  private async loadBoss(tx: Store, now: number): Promise<BossState> {
    const week = weekKey(dayKey(now, this.config.timeZone));
    return (
      (await tx.bosses.get(week)) ??
      newBoss(week, bossNameFor(week, this.config.boss.name), this.config.boss.baseHpXp)
    );
  }

  private async ownGoal(tx: Store, userId: string, goalId: string): Promise<GoalRecord> {
    const goal = await tx.goals.get(goalId);
    // Same error for "missing" and "someone else's" so ids can't be probed.
    if (!goal || goal.userId !== userId) throw notFoundError("That goal doesn't exist.");
    return goal;
  }

  private async insertGoals(tx: Store, userId: string, texts: readonly string[], now: number) {
    if (texts.length === 0) return;
    const open = await tx.goals.countOpen(userId);
    if (open + texts.length > LIMITS.maxOpenGoals) {
      throw validationError(
        `You can have up to ${LIMITS.maxOpenGoals} open goals. Finish or remove one first.`,
      );
    }
    // Offset timestamps so goals typed together keep their order.
    for (const [i, text] of texts.entries()) {
      await tx.goals.insert({
        id: this.deps.newId(),
        userId,
        text,
        done: false,
        xpAwarded: false,
        createdAt: now + i,
        completedAt: null,
      });
    }
  }

  private async applyStartOptions(
    tx: Store,
    userId: string,
    goals: readonly string[],
    goalsPrivate: boolean | undefined,
    now: number,
  ): Promise<void> {
    await this.insertGoals(tx, userId, goals, now);
    if (typeof goalsPrivate === "boolean") {
      const member = await this.loadMember(tx, userId);
      await tx.members.save({ ...member, goalsPrivate });
    }
  }

  private async goalPrompt(tx: Store, userId: string): Promise<GoalDto | null> {
    const goal = (await tx.goals.firstOpen([userId])).get(userId);
    return goal ? { id: goal.id, text: goal.text, done: goal.done } : null;
  }

  private goalsArePrivate(member: MemberRecord | undefined): boolean {
    return member?.goalsPrivate ?? !this.config.goalsPublicByDefault;
  }

  // ---------------------------------------------------------------- views

  private async buildRoomState(tx: Store, now: number): Promise<RoomStateDto> {
    const cycle = await tx.room.getCycle();
    const participants = await tx.room.listParticipants();
    const phase = cycle ? phaseAt(buildCycle(cycle.cycleStartedAt, cycle.preset), now) : undefined;
    const timer: RoomTimerDto =
      cycle && phase
        ? {
            phase: phase.kind,
            round: phase.round,
            rounds: cycle.preset.rounds,
            phaseStartedAt: phase.startsAt,
            phaseEndsAt: phase.endsAt,
            preset: cycle.preset,
          }
        : {
            phase: "idle",
            round: 0,
            rounds: this.config.preset.rounds,
            phaseStartedAt: 0,
            phaseEndsAt: 0,
            preset: this.config.preset,
          };

    const solos = await tx.solos.list();
    const ids = [...participants.map((p) => p.userId), ...solos.map((s) => s.userId)];
    const members = new Map((await tx.members.list(ids)).map((m) => [m.userId, m]));
    const goals = await tx.goals.firstOpen(ids);
    const today = dayKey(now, this.config.timeZone);
    const looks = await this.cardLooks(tx, ids, members);
    // Hidden members are already left out of the standings, so they get no rank.
    const ranks = new Map(
      rankByMinutes(await tx.leaderboard.standings(weekKey(today), today)).map((e) => [
        e.userId,
        e.rank,
      ]),
    );

    const card = (
      userId: string,
      status: MemberCardDto["status"],
      endsAt: number,
    ): MemberCardDto => {
      const member = members.get(userId);
      const isPrivate = this.goalsArePrivate(member);
      return {
        userId,
        status,
        endsAt,
        goalText: isPrivate ? "" : (goals.get(userId)?.text ?? ""),
        goalPrivate: isPrivate,
        level: levelFromXp(member?.xpTotal ?? 0).level,
        streak: member ? currentStreak(member.streak, today, this.config.streakFreezesEnabled) : 0,
        badges: looks.get(userId)?.showcase ?? [],
        cardStyle: looks.get(userId)?.style ?? "classic",
        weeklyRank: ranks.get(userId) ?? 0,
      };
    };

    const cards = [
      ...participants.map((p: ParticipantRecord) =>
        card(p.userId, phase?.kind === "focus" ? "roomFocus" : "roomBreak", phase?.endsAt ?? now),
      ),
      ...solos.map((s) =>
        s.phase === "focus"
          ? card(s.userId, "soloFocus", s.endsAt)
          : card(s.userId, "soloBreak", s.breakEndsAt),
      ),
    ];

    return {
      serverNow: now,
      timer,
      members: cards,
      presentCount: new Set([...this.present, ...ids]).size,
      roomParticipantCount: participants.length,
      combo: comboFor(participants.length, this.config.comboEnabled),
      boss: await this.bossDto(tx, now),
      features: {
        presetKey: this.config.presetKey,
        xpEnabled: this.config.xp.enabled,
        comboEnabled: this.config.comboEnabled,
        bossEnabled: this.config.boss.enabled,
        streakFreezesEnabled: this.config.streakFreezesEnabled,
        goalsPublicByDefault: this.config.goalsPublicByDefault,
        dailyXpCap: this.config.xp.dailyCap,
        postChannelName: this.config.postChannelId ? this.config.postChannelName : "",
      },
      voice: this.config.voiceChannelId
        ? {
            channelName: this.config.voiceChannelName,
            joinUrl: this.config.voiceChannelUrl,
            userIds: [...this.inVoice],
          }
        : { channelName: "", joinUrl: "", userIds: [] },
    };
  }

  private async bossDto(tx: Store, now: number): Promise<BossDto> {
    const endsAt = nextWeekStart(now, this.config.timeZone);
    if (!this.config.boss.enabled) {
      return {
        enabled: false,
        name: "",
        maxHpXp: 0,
        damageXp: 0,
        strength: 1,
        lootXp: 0,
        endsAt,
        defeated: false,
      };
    }
    const boss = await this.loadBoss(tx, now);
    return {
      enabled: true,
      name: boss.name,
      maxHpXp: boss.maxHpXp,
      damageXp: boss.damageXp,
      strength: bossStrength(boss.name),
      lootXp: this.config.xp.enabled ? bossLootXp(boss.name) : 0,
      endsAt,
      defeated: boss.defeatedAt !== null,
    };
  }

  /** What each member's card shows: their style and showcase badges. */
  private async cardLooks(
    tx: Store,
    userIds: readonly string[],
    members: ReadonlyMap<string, MemberRecord>,
  ): Promise<Map<string, CardLookDto>> {
    const earned = new Map<string, EarnedBadgeRecord[]>();
    for (const badge of await tx.badges.list(userIds)) {
      earned.set(badge.userId, [...(earned.get(badge.userId) ?? []), badge]);
    }
    const cards = new Map((await tx.cards.list(userIds)).map((c) => [c.userId, c]));
    const looks = new Map<string, CardLookDto>();
    for (const userId of userIds) {
      const mine = earned.get(userId) ?? [];
      const card = cards.get(userId);
      const level = levelFromXp(members.get(userId)?.xpTotal ?? 0).level;
      looks.set(userId, {
        chosenStyle: card?.style ?? "",
        chosenShowcase: card?.showcase ?? [],
        style: resolveCardStyle(card?.style ?? null, level, new Set(mine.map((b) => b.badgeId))),
        showcase: resolveShowcase(card?.showcase ?? null, mine),
      });
    }
    return looks;
  }

  private async buildProgress(tx: Store, userId: string, now: number): Promise<ProgressDto> {
    const today = dayKey(now, this.config.timeZone);
    const from = addDays(today, -(LIMITS.progressWindowDays - 1));
    const rows = await tx.stats.listForUser(userId, from, today);
    const byDay = new Map(rows.map((r) => [r.day, r.focusMinutes]));
    const days = Array.from({ length: LIMITS.progressWindowDays }, (_, i) => {
      const day = addDays(from, i);
      return { day, focusMinutes: byDay.get(day) ?? 0 };
    });
    const member = await tx.members.get(userId);
    const members = new Map(member ? [[userId, member]] : []);
    return {
      me: await this.buildMyStatus(tx, userId, now),
      days,
      totalFocusMinutes: days.reduce((sum, d) => sum + d.focusMinutes, 0),
      quests: (await this.weeklyQuests(tx, userId, now)).map((q) => this.questDto(q)),
      badges: (await tx.badges.list([userId])).map((b) => ({
        id: b.badgeId,
        earnedAt: b.earnedAt,
      })),
      card: (await this.cardLooks(tx, [userId], members)).get(userId)!,
    };
  }

  private async buildMyStatus(tx: Store, userId: string, now: number): Promise<MyStatusDto> {
    const tz = this.config.timeZone;
    const today = dayKey(now, tz);
    const member = await tx.members.get(userId);
    const streakState = member?.streak ?? EMPTY_STREAK;
    const progress = levelFromXp(member?.xpTotal ?? 0);
    const solo = await tx.solos.get(userId);
    const participant = (await tx.room.listParticipants()).find((p) => p.userId === userId);
    const onRoomTimer = participant !== undefined;

    let status: MyStatusDto["status"] = "idle";
    let endsAt = 0;
    let keepGoingEndsAt = 0;
    if (participant) {
      const cycle = await tx.room.getCycle();
      if (cycle) keepGoingEndsAt = this.keepGoingEndsAt(participant, cycle, now);
      const phase = cycle
        ? phaseAt(buildCycle(cycle.cycleStartedAt, cycle.preset), now)
        : undefined;
      status = phase?.kind === "focus" ? "roomFocus" : "roomBreak";
      endsAt = phase?.endsAt ?? now;
    } else if (solo) {
      status = solo.phase === "focus" ? "soloFocus" : "soloBreak";
      endsAt = solo.phase === "focus" ? solo.endsAt : solo.breakEndsAt;
    }

    const goals = await tx.goals.listForUser(userId, startOfDay(today, tz));
    return {
      userId,
      status,
      endsAt,
      onRoomTimer,
      xpTotal: member?.xpTotal ?? 0,
      level: progress.level,
      xpIntoLevel: progress.xpIntoLevel,
      xpForNextLevel: progress.xpForNextLevel,
      xpToday: (await tx.stats.get(userId, today))?.xp ?? 0,
      streak: currentStreak(streakState, today, this.config.streakFreezesEnabled),
      freezeAvailable: freezeAvailable(streakState, today, this.config.streakFreezesEnabled),
      goals: goals.map((g) => ({ id: g.id, text: g.text, done: g.done })),
      goalsPrivate: this.goalsArePrivate(member),
      keepGoingEndsAt,
    };
  }

  private async buildLeaderboard(
    tx: Store,
    userId: string,
    now: number,
    by: LeaderboardMetric,
    period: LeaderboardPeriod,
  ): Promise<LeaderboardDto> {
    const tz = this.config.timeZone;
    const today = dayKey(now, tz);
    const { startDay, endsAt } = periodBounds(period, today, now, tz);
    const range: StandingsRange = {
      fromDay: startDay || EARLIEST_DAY,
      toDay: today,
      fromMs: startDay ? startOfDay(startDay, tz) : 0,
      toMs: startOfDay(addDays(today, 1), tz),
    };
    const minutes = new Map(
      (await tx.leaderboard.standings(range.fromDay, today)).map((r) => [
        r.userId,
        Math.floor(r.focusMinutes),
      ]),
    );
    const xp = new Map((await tx.leaderboard.xpStandings(range)).map((r) => [r.userId, r.xp]));
    const totals = (by === "xp" ? [...xp] : [...minutes]).map(([id, value]) => ({
      userId: id,
      value,
    }));
    const ranked = rankBy(totals).map(({ userId: id, rank }) => ({
      userId: id,
      focusMinutes: minutes.get(id) ?? 0,
      xp: xp.get(id) ?? 0,
      rank,
    }));
    const myRows = await tx.stats.listForUser(userId, range.fromDay, today);
    return {
      by,
      period,
      startDay,
      endsAt,
      entries: ranked.slice(0, LIMITS.leaderboardSize),
      me: {
        rank: ranked.find((e) => e.userId === userId)?.rank ?? 0,
        focusMinutes: Math.floor(myRows.reduce((sum, r) => sum + r.focusMinutes, 0)),
        xp: await tx.leaderboard.xpFor(userId, range),
        hidden: await tx.leaderboard.isHidden(userId),
      },
    };
  }

  /** When the member's "Keep going?" prompt closes, or 0 when it isn't showing for them. */
  private keepGoingEndsAt(
    participant: ParticipantRecord,
    cycle: RoomCycleRecord,
    now: number,
  ): number {
    const { opensAt, closesAt } = keepGoingWindow(buildCycle(cycle.cycleStartedAt, cycle.preset));
    const asked = !participant.keepGoing && participant.joinedAt < opensAt;
    return asked && now >= opensAt && now < closesAt ? closesAt : 0;
  }

  private async recapFor(tx: Store, at: number, now: number): Promise<RecapDto> {
    const tz = this.config.timeZone;
    const day = dayKey(at, tz);
    const stats = await tx.stats.communityDay(day);
    const hidden = new Set(await tx.leaderboard.listHidden());
    const candidates = await tx.members.listActiveSince(addDays(day, -14));
    const topStreaks = candidates
      .filter((m) => !hidden.has(m.userId))
      .map((m) => ({
        userId: m.userId,
        streak: currentStreak(m.streak, day, this.config.streakFreezesEnabled),
      }))
      .filter((s) => s.streak > 0)
      .sort((a, b) => b.streak - a.streak || a.userId.localeCompare(b.userId))
      .slice(0, LIMITS.topStreaksInRecap);
    const topFocus = this.config.recapLeaderboardEnabled
      ? rankByMinutes(await tx.leaderboard.standings(weekKey(day), day))
          .slice(0, LIMITS.topFocusInRecap)
          .map(({ userId, focusMinutes }) => ({ userId, focusMinutes }))
      : [];
    let boss: RecapDto["boss"] = null;
    if (this.config.boss.enabled) {
      const state = await this.loadBoss(tx, at);
      const weekEnd = addDays(state.weekKey, 7);
      boss = {
        name: state.name,
        hpLeftXp: bossHpLeft(state),
        daysLeft: Math.max(0, daysBetween(dayKey(now, tz), weekEnd)),
        defeated: state.defeatedAt !== null,
      };
    }
    return {
      day,
      weekday: weekdayName(day),
      focusMinutes: stats.focusMinutes,
      goalsDone: stats.goalsDone,
      activeMembers: stats.activeMembers,
      boss,
      topStreaks,
      topFocus,
    };
  }
}

/**
 * Whole minutes, ranked so ties share a place (1, 2, 2, 4). Rounding down
 * first means two people shown with the same minutes never get different ranks.
 */
function rankByMinutes(rows: readonly { userId: string; focusMinutes: number }[]) {
  return rankBy(rows.map((r) => ({ userId: r.userId, value: r.focusMinutes }))).map(
    ({ userId, value, rank }) => ({ userId, focusMinutes: value, rank }),
  );
}

/** Ranks whole, positive values, most first, so ties share a place (1, 2, 2, 4). */
function rankBy(rows: readonly { userId: string; value: number }[]) {
  const whole = rows
    .map((r) => ({ userId: r.userId, value: Math.floor(r.value) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  let rank = 0;
  return whole.map((r, i) => {
    if (i === 0 || r.value !== whole[i - 1]!.value) rank = i + 1;
    return { ...r, rank };
  });
}

/** Before any day the app could have data for, so "all time" can share the range queries. */
const EARLIEST_DAY = "0000-01-01";

/** First day of the period ("" for all time) and when it ends (0 for all time). */
function periodBounds(period: LeaderboardPeriod, today: string, now: number, tz: string) {
  switch (period) {
    case "week":
      return { startDay: weekKey(today), endsAt: nextWeekStart(now, tz) };
    case "month":
      return { startDay: monthKey(today), endsAt: nextMonthStart(now, tz) };
    case "year":
      return { startDay: yearKey(today), endsAt: nextYearStart(now, tz) };
    case "all":
      return { startDay: "", endsAt: 0 };
  }
}

function validatePeriod(period: unknown): LeaderboardPeriod {
  if (period === "week" || period === "month" || period === "year" || period === "all")
    return period;
  throw validationError("The leaderboard covers a week, month, year or all time.");
}

function validateMetric(by: unknown): LeaderboardMetric {
  if (by === "minutes" || by === "xp") return by;
  throw validationError("The leaderboard ranks by minutes or xp.");
}
