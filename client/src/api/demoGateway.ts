import {
  addDays,
  BADGES,
  badgeById,
  bossNameFor,
  customPreset,
  dayKey,
  DEFAULT_CONFIG,
  newBoss,
  squadPost,
  weekKey,
  MemoryStore,
  StudyRoomEngine,
  type AppConfig,
  type LeaderboardMetric,
  type LeaderboardPeriod,
  type MyStatusDto,
  type PersonalResultDto,
  type PhaseCompletedDto,
  type RecapDto,
  type RoomStateDto,
  type WakeScheduler,
} from "@studyroom/core";
import type { GatewayHandlers, Profile, StartRequest, StudyRoomGateway } from "./gateway";
import { toGatewayError } from "./gateway";

const MINUTE = 60_000;
export const DEMO_USER_ID = "demo-you";

export interface DemoOptions {
  /** Room timer focus length in minutes. Fractions allowed so tests can run fast. */
  focusMinutes?: number;
  breakMinutes?: number;
  /** How far into round 1 the room is when the page opens. */
  elapsedMinutes: number;
  bots: boolean;
  // Test knobs. Each one is left out unless its URL parameter is given.
  /** HP the weekly boss has left, in XP. */
  bossHpLeft?: number;
  /** Stands in for the admin's "Boss name" setting. */
  bossName?: string;
  /** Stands in for the admin's "Boss base HP" setting. */
  bossBaseHp?: number;
  /** Stands in for the admin's "Daily XP cap" setting. */
  dailyCap?: number;
  /** Your starting streak and XP. */
  streak?: number;
  xp?: number;
  /** Days missed since you were last active. 0 means yesterday was active. */
  missedDays?: number;
  /** Badges whose unlock animation plays when the page opens, without earning them. */
  unlock?: string[];
  /** Badges you already hold when the page opens. You start with none otherwise. */
  badges?: string[];
}

interface Bot {
  userId: string;
  name: string;
  goal: string;
  /** Lifetime XP and streak, so the board looks like a room that's been open a while. */
  xp: number;
  streak: number;
  /** Earned badges, oldest first, so cards show a few. */
  badges: string[];
  cardStyle?: string;
  private?: boolean;
  solo?: number;
}

const BOTS: Bot[] = [
  {
    userId: "bot-ana",
    name: "Ana R.",
    goal: "Orgo ch. 4 notes",
    xp: 5600,
    streak: 31,
    badges: ["first-boss", "streak-30", "night-owl"],
    cardStyle: "midnight",
  },
  {
    userId: "bot-marcus",
    name: "Marcus",
    goal: "LeetCode: 3 mediums",
    xp: 3200,
    streak: 12,
    badges: ["squad-up", "leet", "streak-7"],
  },
  {
    userId: "bot-priya",
    name: "Priya",
    goal: "Thesis lit review",
    xp: 8200,
    streak: 54,
    badges: ["focus-100h", "streak-50", "three-am"],
    private: true,
    solo: 45,
  },
  {
    userId: "bot-devon",
    name: "Devon",
    goal: "Essay intro draft",
    xp: 900,
    streak: 3,
    badges: ["streak-3"],
  },
  {
    userId: "bot-jordan",
    name: "Jordan",
    goal: "Stats HW 5",
    xp: 1700,
    streak: 8,
    badges: ["early-bird", "comeback"],
  },
  {
    userId: "bot-lena",
    name: "Lena",
    goal: "Anki: 120 cards",
    xp: 2200,
    streak: 9,
    badges: ["productive-day", "speedrun"],
    solo: 25,
  },
  {
    userId: "bot-kai",
    name: "Kai",
    goal: "Spanish reading",
    xp: 3900,
    streak: 17,
    badges: ["marathon", "full-house", "first-boss"],
  },
];

/**
 * You start at level 7 on a 5-day streak, so finishing a round makes it 6.
 * You start with no badges, so your first round, goal and streak earn them
 * live, with their unlock moments, the way a new member would.
 */
const YOU = {
  xp: 2315,
  streak: 5,
};
/** The weekly boss starts 39% down. */
const BOSS_DAMAGE_SHARE = 0.39;

/** One of each medal, in tier order, for `?unlock=all`. */
function onePerTier(): string[] {
  const tiers = ["bronze", "silver", "gold", "platinum", "secret"];
  return tiers.flatMap((tier) => BADGES.find((b) => b.tier === tier)?.id ?? []);
}

/**
 * Reads demo knobs from the URL, e.g. `?focus=0.2&break=0.1&bots=0`. Test
 * knobs (`bossLeft`, `bossName`, `bossHp`, `cap`, `streak`, `xp`, `missed`,
 * `unlock`, `badges`) set up states that take days or hours to reach for real. See
 * docs/TESTING.md.
 */
export function demoOptionsFromSearch(search: string): DemoOptions {
  const params = new URLSearchParams(search);
  const number = (key: string) => {
    const raw = params.get(key);
    const value = raw === null || raw.trim() === "" ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const positive = (key: string) => {
    const value = number(key);
    return value !== undefined && value > 0 ? value : undefined;
  };
  const whole = (key: string, max: number) => {
    const value = number(key);
    return value !== undefined && value >= 0 ? Math.min(max, Math.round(value)) : undefined;
  };
  const bossName = params.get("bossName")?.trim().slice(0, 40);
  const unlock = params.get("unlock");
  const options: DemoOptions = {
    focusMinutes: positive("focus"),
    breakMinutes: positive("break"),
    elapsedMinutes: positive("elapsed") ?? (params.has("focus") ? 0 : 10.5),
    bots: params.get("bots") !== "0",
  };
  const bossHpLeft = whole("bossLeft", 1_000_000);
  if (bossHpLeft !== undefined && bossHpLeft > 0) options.bossHpLeft = bossHpLeft;
  if (bossName) options.bossName = bossName;
  const bossBaseHp = whole("bossHp", 1_000_000);
  if (bossBaseHp !== undefined && bossBaseHp > 0) options.bossBaseHp = bossBaseHp;
  const dailyCap = whole("cap", 100_000);
  if (dailyCap !== undefined && dailyCap > 0) options.dailyCap = dailyCap;
  const streak = whole("streak", 1000);
  if (streak !== undefined) options.streak = streak;
  const xp = whole("xp", 10_000_000);
  if (xp !== undefined) options.xp = xp;
  const missedDays = whole("missed", 30);
  if (missedDays !== undefined) options.missedDays = missedDays;
  const held = params.get("badges");
  if (held) {
    const known = held
      .split(",")
      .map((id) => id.trim())
      .filter((id) => badgeById(id) !== undefined);
    if (known.length > 0) options.badges = known;
  }
  if (unlock) {
    const ids = unlock === "all" ? onePerTier() : unlock.split(",").map((id) => id.trim());
    const known = ids.filter((id) => badgeById(id) !== undefined);
    if (known.length > 0) options.unlock = known;
  }
  return options;
}

class BrowserScheduler implements WakeScheduler {
  private handle: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly now: () => number) {}
  wakeAt(at: number, callback: () => void) {
    this.cancel();
    this.handle = setTimeout(callback, Math.max(0, at - this.now()));
  }
  cancel() {
    if (this.handle !== null) clearTimeout(this.handle);
    this.handle = null;
  }
}

function demoConfig(options: DemoOptions): AppConfig {
  const custom = options.focusMinutes !== undefined || options.breakMinutes !== undefined;
  const preset = custom
    ? customPreset(options.focusMinutes ?? 25, options.breakMinutes ?? 5)
    : DEFAULT_CONFIG.preset;
  return {
    ...DEFAULT_CONFIG,
    presetKey: custom ? "custom" : DEFAULT_CONFIG.presetKey,
    preset,
    xp: { ...DEFAULT_CONFIG.xp, dailyCap: options.dailyCap ?? DEFAULT_CONFIG.xp.dailyCap },
    boss: {
      ...DEFAULT_CONFIG.boss,
      name: options.bossName ?? DEFAULT_CONFIG.boss.name,
      baseHpXp: options.bossBaseHp ?? DEFAULT_CONFIG.boss.baseHpXp,
    },
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    postChannelId: "demo-channel",
    postChannelName: "study-hall",
    voiceChannelId: "demo-voice",
    voiceChannelName: "Study voice",
    voiceChannelUrl: "https://rootapp.com",
  };
}

/**
 * Runs the real StudyRoomEngine in the browser on an in-memory store, with a
 * few simulated members. Used for local UI work and end-to-end tests.
 */
export class DemoGateway implements StudyRoomGateway {
  readonly kind = "demo" as const;
  /** Posts the app would have made in a Root channel. */
  readonly posts: string[] = [];
  private readonly listeners = new Set<GatewayHandlers>();
  private readonly engine: StudyRoomEngine;
  private readonly store = new MemoryStore();
  private readonly config: AppConfig;
  private readonly pendingBots = new Set<string>();
  private skewMs = 0;
  private unlockPreviewed = false;
  private nextId = 1;

  private constructor(private readonly options: DemoOptions) {
    const now = () => Date.now() + this.skewMs;
    this.config = demoConfig(options);
    this.engine = new StudyRoomEngine({
      store: this.store,
      clock: { now },
      scheduler: new BrowserScheduler(now),
      notifier: {
        roomUpdated: (room: RoomStateDto) => this.emit((h) => h.roomUpdated(room)),
        phaseCompleted: (event: PhaseCompletedDto) => this.emit((h) => h.phaseCompleted(event)),
        personalResult: (userId: string, event: PersonalResultDto) => {
          if (userId === DEMO_USER_ID) this.emit((h) => h.personalResult(event));
        },
        myStatusUpdated: (userId: string, me: MyStatusDto) => {
          if (userId === DEMO_USER_ID) this.emit((h) => h.myStatus(me));
          else this.keepBotBusy(userId, me);
        },
        badgesEarned: (userId: string, badgeIds: string[]) => {
          if (userId === DEMO_USER_ID) this.emit((h) => h.badgesEarned(badgeIds));
        },
      },
      announcer: {
        busyRoom: async (_c, count, combo) =>
          this.post(`${count} people are focusing right now. Combo is at ${combo}x.`),
        streakMilestone: async (_c, userId, streak) =>
          this.post(`${this.nameOf(userId)} just hit a ${streak} day streak.`),
        bossDefeated: async (_c, name) => this.post(`The room defeated ${name}!`),
        dailyRecap: async (_c, recap: RecapDto) => this.post(`${recap.weekday} recap`),
        squadMessage: async (_c, event, text, userIds) =>
          this.post(
            squadPost(
              event,
              text,
              userIds.map((id) => this.nameOf(id)),
              userIds.length,
            ),
          ),
      },
      logger: console,
      config: this.config,
      newId: () => `demo-${this.nextId++}`,
      random: Math.random,
    });
  }

  static async create(options: DemoOptions): Promise<DemoGateway> {
    const gateway = new DemoGateway(options);
    await gateway.seed();
    return gateway;
  }

  /** Bots join in the past so the room opens mid-round, like a real busy evening. */
  private async seed() {
    await this.seedHistory();
    if (this.options.bots) {
      this.skewMs = -this.options.elapsedMinutes * MINUTE;
      for (const bot of BOTS) await this.startBot(bot);
      this.skewMs = 0;
    }
    await this.engine.setPresence([
      DEMO_USER_ID,
      ...(this.options.bots ? BOTS.map((b) => b.userId) : []),
    ]);
    if (this.options.bots) await this.engine.setVoiceMembers(["bot-ana", "bot-priya"]);
    await this.engine.start();
  }

  private async seedHistory() {
    const tz = this.config.timeZone;
    const today = dayKey(Date.now(), tz);
    const yesterday = addDays(today, -1);
    const member = (userId: string, xp: number, streak: number, lastActiveDay = yesterday) =>
      this.store.members.save({
        userId,
        xpTotal: xp,
        streak: { streak, lastActiveDay, freezeWeeksUsed: [] },
        goalsPrivate: null,
      });
    const yourStreak = this.options.streak ?? YOU.streak;
    const missed = this.options.missedDays ?? 0;
    await member(DEMO_USER_ID, this.options.xp ?? YOU.xp, yourStreak, addDays(today, -1 - missed));
    const earnedAt = Date.now() - 30 * 24 * 60 * MINUTE;
    const award = async (userId: string, badges: readonly string[]) => {
      for (const [i, badgeId] of badges.entries())
        await this.store.badges.award({ userId, badgeId, earnedAt: earnedAt + i * MINUTE });
    };
    await award(DEMO_USER_ID, this.options.badges ?? []);
    // Five weeks of history: any missed days, then the streak's active days,
    // a gap before that, then a mixed record.
    for (let back = 1; back < 35; back++) {
      const streakDay = back - missed;
      const minutes =
        streakDay < 1
          ? 0
          : streakDay <= yourStreak
            ? 30 + ((back * 37) % 90)
            : streakDay === yourStreak + 1
              ? 0
              : (back * 53) % 4 === 0
                ? 0
                : (back * 29) % 140;
      if (minutes > 0)
        await this.store.stats.add(DEMO_USER_ID, addDays(today, -back), {
          focusMinutes: minutes,
          xp: Math.min(this.config.xp.dailyCap, minutes * 2),
        });
    }
    await this.seedBoss();
    if (!this.options.bots) return;
    // Some earlier weeks, so month, year and all time rank differently from this week.
    for (const [i, bot] of BOTS.entries()) {
      for (let back = 120; back > 0; back--) {
        const day = addDays(weekKey(today), -back);
        if ((i * 7 + back * 3) % 5 >= 2) continue;
        const focusMinutes = 20 + ((i * 31 + back * 17) % 110);
        await this.store.stats.add(bot.userId, day, {
          focusMinutes,
          xp: Math.min(this.config.xp.dailyCap, focusMinutes * 2),
        });
      }
    }
    // Earlier days this week, so the weekly leaderboard has standings to show.
    for (const [i, bot] of BOTS.entries()) {
      for (let day = weekKey(today); day < today; day = addDays(day, 1)) {
        const focusMinutes = 30 + ((i * 47 + Number(day.slice(-2)) * 29) % 120);
        // Some goal XP on top, so ranking by XP doesn't just repeat the minutes.
        const goalXp = ((i * 5 + Number(day.slice(-2))) % 3) * 25;
        await this.store.stats.add(bot.userId, day, {
          focusMinutes,
          xp: Math.min(this.config.xp.dailyCap, focusMinutes * 2 + goalXp),
        });
      }
    }
    for (const bot of BOTS) {
      await member(bot.userId, bot.xp, bot.streak);
      await award(bot.userId, bot.badges);
      if (bot.cardStyle)
        await this.store.cards.save({ userId: bot.userId, style: bot.cardStyle, showcase: null });
    }
  }

  /** This week's boss, part way down. Without bots it starts fresh unless `?bossLeft=` says otherwise. */
  private async seedBoss() {
    const week = weekKey(dayKey(Date.now(), this.config.timeZone));
    const boss = newBoss(week, bossNameFor(week, this.config.boss.name), this.config.boss.baseHpXp);
    const left = this.options.bossHpLeft;
    const damageXp =
      left !== undefined
        ? Math.max(0, boss.maxHpXp - left)
        : this.options.bots
          ? Math.round(boss.maxHpXp * BOSS_DAMAGE_SHARE)
          : 0;
    if (damageXp > 0) await this.store.bosses.save({ ...boss, damageXp });
  }

  private async startBot(bot: Bot) {
    const start = { goals: [bot.goal], goalsPrivate: bot.private ?? false };
    if (bot.solo) await this.engine.startSolo(bot.userId, bot.solo, start);
    else await this.engine.joinRoomTimer(bot.userId, start);
  }

  /**
   * Bots tap "Keep going?", and when a bot's session ends anyway it starts
   * another a few seconds later, so the room never empties.
   */
  private keepBotBusy(userId: string, me: MyStatusDto) {
    const bot = BOTS.find((b) => b.userId === userId);
    if (bot && me.keepGoingEndsAt > 0) {
      this.engine.keepGoing(userId).catch(() => undefined);
      return;
    }
    if (!bot || me.status !== "idle" || this.pendingBots.has(userId)) return;
    this.pendingBots.add(userId);
    setTimeout(() => {
      this.pendingBots.delete(userId);
      const start = {
        goals: me.goals.some((g) => !g.done) ? [] : [bot.goal],
        goalsPrivate: bot.private ?? false,
      };
      const work = bot.solo
        ? this.engine.startSolo(userId, bot.solo, start)
        : this.engine.joinRoomTimer(userId, start);
      work.catch(() => undefined);
    }, 3_000);
  }

  /**
   * `?unlock=` plays unlock animations once, on the first click or key press:
   * browsers only allow sound after one. Nothing is awarded, so a reload
   * plays them again.
   */
  private previewUnlocks() {
    const ids = this.options.unlock;
    if (!ids || this.unlockPreviewed) return;
    this.unlockPreviewed = true;
    const play = () => {
      window.removeEventListener("pointerdown", play);
      window.removeEventListener("keydown", play);
      // Let the app's own click handler unlock audio first.
      setTimeout(() => this.emit((h) => h.badgesEarned(ids)), 300);
    };
    window.addEventListener("pointerdown", play);
    window.addEventListener("keydown", play);
    console.info(`[demo] Click anywhere to play ${ids.length} badge unlock(s).`);
  }

  private emit(fn: (handlers: GatewayHandlers) => void) {
    for (const listener of this.listeners) fn(listener);
  }

  private post(text: string) {
    this.posts.push(text);
    console.info(`[demo] #study-hall: ${text}`);
  }

  private nameOf(userId: string) {
    return userId === DEMO_USER_ID
      ? "You"
      : (BOTS.find((b) => b.userId === userId)?.name ?? "Someone");
  }

  private async call<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw toGatewayError(error);
    }
  }

  currentUserId() {
    return DEMO_USER_ID;
  }

  now() {
    return Date.now() + this.skewMs;
  }

  getSnapshot() {
    return this.call(() => this.engine.getSnapshot(DEMO_USER_ID));
  }

  joinRoomTimer(request: StartRequest) {
    return this.call(() => this.engine.joinRoomTimer(DEMO_USER_ID, request));
  }

  leaveRoomTimer() {
    return this.call(() => this.engine.leaveRoomTimer(DEMO_USER_ID));
  }

  startSolo(minutes: number, request: StartRequest) {
    return this.call(() => this.engine.startSolo(DEMO_USER_ID, minutes, request));
  }

  endSolo() {
    return this.call(() => this.engine.endSolo(DEMO_USER_ID));
  }

  addGoal(text: string) {
    return this.call(() => this.engine.addGoal(DEMO_USER_ID, text));
  }

  setGoalDone(goalId: string, done: boolean) {
    return this.call(() => this.engine.setGoalDone(DEMO_USER_ID, goalId, done));
  }

  deleteGoal(goalId: string) {
    return this.call(() => this.engine.deleteGoal(DEMO_USER_ID, goalId));
  }

  setGoalsPrivate(goalsPrivate: boolean) {
    return this.call(() => this.engine.setGoalsPrivate(DEMO_USER_ID, goalsPrivate));
  }

  deleteMyData() {
    return this.call(() => this.engine.deleteMyData(DEMO_USER_ID));
  }

  keepGoing() {
    return this.call(() => this.engine.keepGoing(DEMO_USER_ID));
  }

  getProgress() {
    return this.call(() => this.engine.getProgress(DEMO_USER_ID));
  }

  getLeaderboard(by?: LeaderboardMetric, period?: LeaderboardPeriod) {
    return this.call(() => this.engine.getLeaderboard(DEMO_USER_ID, by, period));
  }

  setLeaderboardHidden(hidden: boolean, by?: LeaderboardMetric, period?: LeaderboardPeriod) {
    return this.call(() => this.engine.setLeaderboardHidden(DEMO_USER_ID, hidden, by, period));
  }

  setCardStyle(style: string) {
    return this.call(() => this.engine.setCardStyle(DEMO_USER_ID, style));
  }

  setBadgeShowcase(badgeIds: string[]) {
    return this.call(() => this.engine.setBadgeShowcase(DEMO_USER_ID, badgeIds));
  }

  getMemberProfile(userId: string) {
    return this.call(() => this.engine.getMemberProfile(userId));
  }

  async getProfiles(userIds: string[]): Promise<Profile[]> {
    return userIds.map((userId) => ({ userId, name: this.nameOf(userId) }));
  }

  subscribe(handlers: GatewayHandlers) {
    this.listeners.add(handlers);
    this.previewUnlocks();
    return () => {
      this.listeners.delete(handlers);
    };
  }
}
