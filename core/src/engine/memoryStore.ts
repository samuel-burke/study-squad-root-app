import type { BossState } from "../game/boss";
import type { DayKey } from "../time/calendar";
import type {
  CardRecord,
  CommunityDayStats,
  DailyStatDelta,
  DailyStatRecord,
  EarnedBadgeRecord,
  GoalRecord,
  MemberRecord,
  ParticipantRecord,
  QuestRewardRecord,
  RoomCycleRecord,
  SessionLogRecord,
  SoloRecord,
  Store,
  WeekFocusRecord,
  XpTotalRecord,
  StandingsRange,
} from "./ports";

declare global {
  // Available in Node 17+ and all current browsers. Core targets both, so it
  // declares the one host API it uses instead of pulling in DOM or Node types.
  function structuredClone<T>(value: T): T;
}

interface Data {
  members: Map<string, MemberRecord>;
  goals: Map<string, GoalRecord>;
  solos: Map<string, SoloRecord>;
  cycle: RoomCycleRecord | null;
  participants: Map<string, ParticipantRecord>;
  sessions: SessionLogRecord[];
  stats: Map<string, DailyStatRecord>;
  leaderboardHidden: Set<string>;
  questRewards: QuestRewardRecord[];
  bosses: Map<string, BossState>;
  kv: Map<string, unknown>;
  badges: EarnedBadgeRecord[];
  cards: Map<string, CardRecord>;
}

const emptyData = (): Data => ({
  members: new Map(),
  goals: new Map(),
  solos: new Map(),
  cycle: null,
  participants: new Map(),
  sessions: [],
  stats: new Map(),
  leaderboardHidden: new Set(),
  questRewards: [],
  bosses: new Map(),
  kv: new Map(),
  badges: [],
  cards: new Map(),
});

const statKey = (userId: string, day: DayKey) => `${userId}|${day}`;
const copy = <T>(value: T): T => structuredClone(value);

/**
 * In-memory Store used by unit tests and the browser demo. Transactions work
 * on a copy and swap it in on success, so a failed operation leaves no trace.
 */
export class MemoryStore implements Store {
  constructor(private data: Data = emptyData()) {}

  /** Read-only view for tests. */
  get sessionLog(): readonly SessionLogRecord[] {
    return this.data.sessions;
  }

  async eraseUser(userId: string): Promise<void> {
    const d = this.data;
    d.members.delete(userId);
    d.solos.delete(userId);
    d.participants.delete(userId);
    d.leaderboardHidden.delete(userId);
    for (const [id, goal] of d.goals) if (goal.userId === userId) d.goals.delete(id);
    for (const [key, stat] of d.stats) if (stat.userId === userId) d.stats.delete(key);
    d.sessions = d.sessions.filter((s) => s.userId !== userId);
    d.questRewards = d.questRewards.filter((r) => r.userId !== userId);
    d.badges = d.badges.filter((b) => b.userId !== userId);
    d.cards.delete(userId);
    for (const boss of d.bosses.values()) {
      boss.contributorIds = boss.contributorIds.filter((id) => id !== userId);
    }
  }

  async transaction<T>(work: (tx: Store) => Promise<T>): Promise<T> {
    const draft = new MemoryStore(copy(this.data));
    const result = await work(draft);
    this.data = draft.data;
    return result;
  }

  members = {
    get: async (userId: string) => copyOrUndefined(this.data.members.get(userId)),
    list: async (userIds: readonly string[]) =>
      userIds.flatMap((id) => {
        const member = this.data.members.get(id);
        return member ? [copy(member)] : [];
      }),
    listActiveSince: async (day: DayKey) =>
      [...this.data.members.values()]
        .filter((m) => m.streak.lastActiveDay !== null && m.streak.lastActiveDay >= day)
        .map(copy),
    save: async (member: MemberRecord) => {
      this.data.members.set(member.userId, copy(member));
    },
  };

  goals = {
    get: async (id: string) => copyOrUndefined(this.data.goals.get(id)),
    listForUser: async (userId: string, doneSince: number) =>
      [...this.data.goals.values()]
        .filter(
          (g) =>
            g.userId === userId &&
            (!g.done || (g.completedAt !== null && g.completedAt >= doneSince)),
        )
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(copy),
    firstOpen: async (userIds: readonly string[]) => {
      const wanted = new Set(userIds);
      const result = new Map<string, GoalRecord>();
      const open = [...this.data.goals.values()]
        .filter((g) => !g.done && wanted.has(g.userId))
        .sort((a, b) => a.createdAt - b.createdAt);
      for (const goal of open) if (!result.has(goal.userId)) result.set(goal.userId, copy(goal));
      return result;
    },
    countOpen: async (userId: string) =>
      [...this.data.goals.values()].filter((g) => g.userId === userId && !g.done).length,
    insert: async (goal: GoalRecord) => {
      this.data.goals.set(goal.id, copy(goal));
    },
    update: async (goal: GoalRecord) => {
      this.data.goals.set(goal.id, copy(goal));
    },
    delete: async (id: string) => {
      this.data.goals.delete(id);
    },
  };

  solos = {
    get: async (userId: string) => copyOrUndefined(this.data.solos.get(userId)),
    list: async () => [...this.data.solos.values()].map(copy),
    save: async (solo: SoloRecord) => {
      this.data.solos.set(solo.userId, copy(solo));
    },
    delete: async (userId: string) => {
      this.data.solos.delete(userId);
    },
  };

  room = {
    getCycle: async () => copyOrUndefined(this.data.cycle ?? undefined),
    saveCycle: async (cycle: RoomCycleRecord | null) => {
      this.data.cycle = cycle ? copy(cycle) : null;
    },
    listParticipants: async () =>
      [...this.data.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt).map(copy),
    addParticipant: async (participant: ParticipantRecord) => {
      this.data.participants.set(participant.userId, copy(participant));
    },
    removeParticipant: async (userId: string) => {
      this.data.participants.delete(userId);
    },
  };

  sessions = {
    insert: async (log: SessionLogRecord) => {
      this.data.sessions.push(copy(log));
    },
    listForUser: async (userId: string, fromMs: number, toMs: number) =>
      this.data.sessions
        .filter((s) => s.userId === userId && s.endedAt >= fromMs && s.endedAt < toMs)
        .sort((a, b) => a.endedAt - b.endedAt)
        .map(copy),
    countFinished: async (userId: string, kind: SessionLogRecord["kind"]) =>
      this.data.sessions.filter((s) => s.userId === userId && s.kind === kind && s.finished).length,
  };

  quests = {
    listRewarded: async (userId: string, weekKey: DayKey) =>
      this.data.questRewards
        .filter((r) => r.userId === userId && r.weekKey === weekKey)
        .map((r) => r.questId),
    markRewarded: async (record: QuestRewardRecord) => {
      const exists = this.data.questRewards.some(
        (r) =>
          r.userId === record.userId &&
          r.weekKey === record.weekKey &&
          r.questId === record.questId,
      );
      if (!exists) this.data.questRewards.push(copy(record));
    },
    countRewarded: async (userId: string) =>
      this.data.questRewards.filter((r) => r.userId === userId).length,
  };

  stats = {
    get: async (userId: string, day: DayKey) =>
      copyOrUndefined(this.data.stats.get(statKey(userId, day))),
    add: async (userId: string, day: DayKey, delta: DailyStatDelta) => {
      const key = statKey(userId, day);
      const current = this.data.stats.get(key) ?? {
        userId,
        day,
        focusMinutes: 0,
        xp: 0,
        goalsDone: 0,
        sessionsFinished: 0,
      };
      this.data.stats.set(key, {
        ...current,
        focusMinutes: current.focusMinutes + (delta.focusMinutes ?? 0),
        xp: current.xp + (delta.xp ?? 0),
        goalsDone: current.goalsDone + (delta.goalsDone ?? 0),
        sessionsFinished: current.sessionsFinished + (delta.sessionsFinished ?? 0),
      });
    },
    listForUser: async (userId: string, fromDay: DayKey, toDay: DayKey) =>
      [...this.data.stats.values()]
        .filter((s) => s.userId === userId && s.day >= fromDay && s.day <= toDay)
        .sort((a, b) => a.day.localeCompare(b.day))
        .map(copy),
    communityDay: async (day: DayKey): Promise<CommunityDayStats> => {
      const rows = [...this.data.stats.values()].filter((s) => s.day === day);
      return {
        focusMinutes: rows.reduce((sum, r) => sum + r.focusMinutes, 0),
        goalsDone: rows.reduce((sum, r) => sum + r.goalsDone, 0),
        activeMembers: rows.filter((r) => r.focusMinutes > 0).length,
      };
    },
    lifetime: async (userId: string) => {
      const rows = [...this.data.stats.values()].filter((s) => s.userId === userId);
      return {
        focusMinutes: rows.reduce((sum, r) => sum + r.focusMinutes, 0),
        goalsDone: rows.reduce((sum, r) => sum + r.goalsDone, 0),
        sessionsFinished: rows.reduce((sum, r) => sum + r.sessionsFinished, 0),
      };
    },
  };

  leaderboard = {
    isHidden: async (userId: string) => this.data.leaderboardHidden.has(userId),
    setHidden: async (userId: string, hidden: boolean) => {
      if (hidden) this.data.leaderboardHidden.add(userId);
      else this.data.leaderboardHidden.delete(userId);
    },
    listHidden: async () => [...this.data.leaderboardHidden].sort(),
    standings: async (fromDay: DayKey, toDay: DayKey): Promise<WeekFocusRecord[]> => {
      const totals = new Map<string, number>();
      for (const s of this.data.stats.values()) {
        if (s.day < fromDay || s.day > toDay || this.data.leaderboardHidden.has(s.userId)) continue;
        totals.set(s.userId, (totals.get(s.userId) ?? 0) + s.focusMinutes);
      }
      return [...totals]
        .filter(([, focusMinutes]) => focusMinutes > 0)
        .map(([userId, focusMinutes]) => ({ userId, focusMinutes }))
        .sort((a, b) => b.focusMinutes - a.focusMinutes || compareIds(a.userId, b.userId));
    },
    xpStandings: async (range: StandingsRange): Promise<XpTotalRecord[]> => {
      const totals = new Map<string, number>();
      for (const s of this.data.stats.values()) {
        if (s.day < range.fromDay || s.day > range.toDay) continue;
        totals.set(s.userId, (totals.get(s.userId) ?? 0) + s.xp);
      }
      for (const r of this.data.questRewards) {
        if (r.rewardedAt >= range.fromMs && r.rewardedAt < range.toMs)
          totals.set(r.userId, (totals.get(r.userId) ?? 0) + r.xp);
      }
      return [...totals]
        .filter(([userId, xp]) => xp > 0 && !this.data.leaderboardHidden.has(userId))
        .map(([userId, xp]) => ({ userId, xp }))
        .sort((a, b) => b.xp - a.xp || compareIds(a.userId, b.userId));
    },
    xpFor: async (userId: string, range: StandingsRange): Promise<number> => {
      let xp = 0;
      for (const s of this.data.stats.values()) {
        if (s.userId === userId && s.day >= range.fromDay && s.day <= range.toDay) xp += s.xp;
      }
      for (const r of this.data.questRewards) {
        if (r.userId === userId && r.rewardedAt >= range.fromMs && r.rewardedAt < range.toMs)
          xp += r.xp;
      }
      return xp;
    },
  };

  bosses = {
    get: async (weekKey: DayKey) => copyOrUndefined(this.data.bosses.get(weekKey)),
    save: async (boss: BossState) => {
      this.data.bosses.set(boss.weekKey, copy(boss));
    },
    countDefeatedWith: async (userId: string) =>
      [...this.data.bosses.values()].filter(
        (b) => b.defeatedAt !== null && b.contributorIds.includes(userId),
      ).length,
  };

  badges = {
    list: async (userIds: readonly string[]) => {
      const wanted = new Set(userIds);
      return this.data.badges
        .filter((b) => wanted.has(b.userId))
        .sort(
          (a, b) =>
            a.earnedAt - b.earnedAt || (a.badgeId < b.badgeId ? -1 : a.badgeId > b.badgeId ? 1 : 0),
        )
        .map(copy);
    },
    award: async (record: EarnedBadgeRecord) => {
      const held = this.data.badges.some(
        (b) => b.userId === record.userId && b.badgeId === record.badgeId,
      );
      if (!held) this.data.badges.push(copy(record));
    },
  };

  cards = {
    list: async (userIds: readonly string[]) =>
      userIds.flatMap((id) => {
        const card = this.data.cards.get(id);
        return card ? [copy(card)] : [];
      }),
    save: async (card: CardRecord) => {
      this.data.cards.set(card.userId, copy(card));
    },
  };

  kv = {
    get: async <T>(key: string) => copyOrUndefined(this.data.kv.get(key) as T | undefined),
    set: async <T>(key: string, value: T) => {
      this.data.kv.set(key, copy(value));
    },
  };
}

/** Byte order, like SQLite's default collation, so both stores break ties the same way. */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function copyOrUndefined<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : copy(value);
}
