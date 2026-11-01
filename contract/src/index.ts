import type {
  BossDto,
  CardLookDto,
  GoalDto,
  LeaderboardDto,
  LeaderboardMetric as LeaderboardMetricDto,
  LeaderboardPeriod as LeaderboardPeriodDto,
  MemberCardDto,
  MemberProfileDto,
  MemberStatus as MemberStatusDto,
  MyStatusDto,
  MyStatusKind,
  PersonalResultDto,
  PhaseCompletedDto,
  PhaseKind,
  PresetKey as PresetKeyDto,
  ProgressDto,
  QuestDto,
  QuestUnit as QuestUnitDto,
  RoomPhase,
  RoomStateDto,
  SnapshotDto,
  TimerPreset as TimerPresetDto,
} from "@studyroom/core";
import {
  LeaderboardMetric,
  LeaderboardPeriod,
  MemberStatus,
  Phase,
  PresetKey,
  QuestUnit,
  ResultSource,
  type Boss,
  type CardLook,
  type Goal,
  type Leaderboard,
  type MemberCard,
  type MemberProfile,
  type MyStatus,
  type PersonalResultEvent,
  type PhaseCompletedEvent,
  type Progress,
  type Quest,
  type RoomSnapshot,
  type RoomState,
  type TimerPreset,
} from "@studyroom/gen-shared";

/**
 * The single place that knows how engine DTOs map onto the generated
 * Protobuf types. The server uses the `to*` half, the client the `from*` half,
 * and a round-trip test keeps the two honest.
 */

// ---------------------------------------------------------------- enums

const PHASE_TO_PROTO: Record<RoomPhase, Phase> = {
  idle: Phase.IDLE,
  focus: Phase.FOCUS,
  break: Phase.BREAK,
  longBreak: Phase.LONG_BREAK,
};

const STATUS_TO_PROTO: Record<MyStatusKind, MemberStatus> = {
  idle: MemberStatus.IDLE,
  roomFocus: MemberStatus.ROOM_FOCUS,
  roomBreak: MemberStatus.ROOM_BREAK,
  soloFocus: MemberStatus.SOLO_FOCUS,
  soloBreak: MemberStatus.SOLO_BREAK,
};

const PRESET_TO_PROTO: Record<PresetKeyDto, PresetKey> = {
  "25-5": PresetKey.STANDARD,
  "50-10": PresetKey.LONG,
  custom: PresetKey.CUSTOM,
};

const QUEST_UNIT_TO_PROTO: Record<QuestUnitDto, QuestUnit> = {
  count: QuestUnit.COUNT,
  minutes: QuestUnit.MINUTES,
};

function invert<K extends string, V extends number>(map: Record<K, V>): Map<V, K> {
  return new Map(Object.entries(map).map(([k, v]) => [v as V, k as K]));
}

const PHASE_FROM_PROTO = invert(PHASE_TO_PROTO);
const STATUS_FROM_PROTO = invert(STATUS_TO_PROTO);
const PRESET_FROM_PROTO = invert(PRESET_TO_PROTO);
const QUEST_UNIT_FROM_PROTO = invert(QUEST_UNIT_TO_PROTO);

const METRIC_TO_PROTO: Record<LeaderboardMetricDto, LeaderboardMetric> = {
  minutes: LeaderboardMetric.MINUTES,
  xp: LeaderboardMetric.XP,
};
const METRIC_FROM_PROTO = invert(METRIC_TO_PROTO);

const PERIOD_TO_PROTO: Record<LeaderboardPeriodDto, LeaderboardPeriod> = {
  week: LeaderboardPeriod.WEEK,
  month: LeaderboardPeriod.MONTH,
  year: LeaderboardPeriod.YEAR,
  all: LeaderboardPeriod.ALL,
};
const PERIOD_FROM_PROTO = invert(PERIOD_TO_PROTO);

export function leaderboardPeriodToProto(period: LeaderboardPeriodDto): LeaderboardPeriod {
  return PERIOD_TO_PROTO[period];
}

/** Unspecified means this week, so older clients keep working. null for a value this build doesn't know. */
export function leaderboardPeriodFromProto(period: LeaderboardPeriod): LeaderboardPeriodDto | null {
  return period === LeaderboardPeriod.UNSPECIFIED
    ? "week"
    : (PERIOD_FROM_PROTO.get(period) ?? null);
}

export function leaderboardMetricToProto(by: LeaderboardMetricDto): LeaderboardMetric {
  return METRIC_TO_PROTO[by];
}

/** Unspecified means minutes, so older clients keep working. null for a value this build doesn't know. */
export function leaderboardMetricFromProto(by: LeaderboardMetric): LeaderboardMetricDto | null {
  return by === LeaderboardMetric.UNSPECIFIED ? "minutes" : (METRIC_FROM_PROTO.get(by) ?? null);
}

function phaseFromProto(phase: Phase): RoomPhase {
  return PHASE_FROM_PROTO.get(phase) ?? "idle";
}

function phaseKindFromProto(phase: Phase): PhaseKind {
  const kind = phaseFromProto(phase);
  return kind === "idle" ? "focus" : kind;
}

function statusFromProto(status: MemberStatus): MyStatusKind {
  return STATUS_FROM_PROTO.get(status) ?? "idle";
}

function memberStatusFromProto(status: MemberStatus): MemberStatusDto {
  const kind = statusFromProto(status);
  return kind === "idle" ? "roomBreak" : kind;
}

// ---------------------------------------------------------------- to proto

const presetToProto = (p: TimerPresetDto): TimerPreset => ({
  focusMinutes: p.focusMinutes,
  breakMinutes: p.breakMinutes,
  longBreakMinutes: p.longBreakMinutes,
  rounds: p.rounds,
});

const goalToProto = (g: GoalDto): Goal => ({ id: g.id, text: g.text, done: g.done });

const bossToProto = (b: BossDto): Boss => ({
  enabled: b.enabled,
  name: b.name,
  maxHpXp: b.maxHpXp,
  damageXp: b.damageXp,
  strength: b.strength,
  lootXp: b.lootXp,
  endsAtMs: b.endsAt,
  defeated: b.defeated,
});

const memberToProto = (m: MemberCardDto): MemberCard => ({
  userId: m.userId,
  status: STATUS_TO_PROTO[m.status],
  endsAtMs: m.endsAt,
  goalText: m.goalText,
  goalPrivate: m.goalPrivate,
  level: m.level,
  streak: m.streak,
  badges: m.badges,
  cardStyle: m.cardStyle,
  weeklyRank: m.weeklyRank,
});

export function roomToProto(room: RoomStateDto): RoomState {
  return {
    serverNowMs: room.serverNow,
    timer: {
      phase: PHASE_TO_PROTO[room.timer.phase],
      round: room.timer.round,
      rounds: room.timer.rounds,
      phaseStartedAtMs: room.timer.phaseStartedAt,
      phaseEndsAtMs: room.timer.phaseEndsAt,
      preset: presetToProto(room.timer.preset),
    },
    members: room.members.map(memberToProto),
    presentCount: room.presentCount,
    roomParticipantCount: room.roomParticipantCount,
    combo: room.combo,
    boss: bossToProto(room.boss),
    features: {
      presetKey: PRESET_TO_PROTO[room.features.presetKey],
      xpEnabled: room.features.xpEnabled,
      comboEnabled: room.features.comboEnabled,
      bossEnabled: room.features.bossEnabled,
      streakFreezesEnabled: room.features.streakFreezesEnabled,
      goalsPublicByDefault: room.features.goalsPublicByDefault,
      dailyXpCap: room.features.dailyXpCap,
      postChannelName: room.features.postChannelName,
    },
    voice: {
      channelName: room.voice.channelName,
      joinUrl: room.voice.joinUrl,
      userIds: room.voice.userIds,
    },
  };
}

export function myStatusToProto(me: MyStatusDto): MyStatus {
  return {
    userId: me.userId,
    status: STATUS_TO_PROTO[me.status],
    endsAtMs: me.endsAt,
    onRoomTimer: me.onRoomTimer,
    xpTotal: me.xpTotal,
    level: me.level,
    xpIntoLevel: me.xpIntoLevel,
    xpForNextLevel: me.xpForNextLevel,
    xpToday: me.xpToday,
    streak: me.streak,
    freezeAvailable: me.freezeAvailable,
    goals: me.goals.map(goalToProto),
    goalsPrivate: me.goalsPrivate,
    keepGoingEndsAtMs: me.keepGoingEndsAt,
    newBadgeIds: me.newBadges ?? [],
  };
}

export function snapshotToProto(snapshot: SnapshotDto): RoomSnapshot {
  return { room: roomToProto(snapshot.room), me: myStatusToProto(snapshot.me) };
}

const questToProto = (q: QuestDto): Quest => ({
  id: q.id,
  title: q.title,
  progress: q.progress,
  target: q.target,
  unit: QUEST_UNIT_TO_PROTO[q.unit],
  xp: q.xp,
  done: q.done,
});

const cardLookToProto = (c: CardLookDto): CardLook => ({
  chosenStyle: c.chosenStyle,
  chosenShowcase: c.chosenShowcase,
  style: c.style,
  showcase: c.showcase,
});

export function progressToProto(progress: ProgressDto): Progress {
  return {
    me: myStatusToProto(progress.me),
    days: progress.days.map((d) => ({ day: d.day, focusMinutes: d.focusMinutes })),
    totalFocusMinutes: progress.totalFocusMinutes,
    quests: progress.quests.map(questToProto),
    badges: progress.badges.map((b) => ({ id: b.id, earnedAtMs: b.earnedAt })),
    card: cardLookToProto(progress.card),
  };
}

export function leaderboardToProto(board: LeaderboardDto): Leaderboard {
  return {
    startDay: board.startDay,
    endsAtMs: board.endsAt,
    entries: board.entries.map((e) => ({
      userId: e.userId,
      focusMinutes: e.focusMinutes,
      rank: e.rank,
      xp: e.xp,
    })),
    myRank: board.me.rank,
    myFocusMinutes: board.me.focusMinutes,
    hidden: board.me.hidden,
    by: METRIC_TO_PROTO[board.by],
    myXp: board.me.xp,
    period: PERIOD_TO_PROTO[board.period],
  };
}

export function memberProfileToProto(profile: MemberProfileDto): MemberProfile {
  return {
    userId: profile.userId,
    level: profile.level,
    xpTotal: profile.xpTotal,
    xpIntoLevel: profile.xpIntoLevel,
    xpForNextLevel: profile.xpForNextLevel,
    streak: profile.streak,
    badges: profile.badges.map((b) => ({ id: b.id, earnedAtMs: b.earnedAt })),
    showcase: profile.showcase,
    cardStyle: profile.cardStyle,
  };
}

export function phaseCompletedToProto(event: PhaseCompletedDto): PhaseCompletedEvent {
  return {
    kind: PHASE_TO_PROTO[event.kind],
    round: event.round,
    finisherUserIds: event.finisherIds,
    roomDamageXp: event.roomDamageXp,
    combo: event.combo,
    room: roomToProto(event.room),
  };
}

export function personalResultToProto(event: PersonalResultDto): PersonalResultEvent {
  return {
    source: event.source === "room" ? ResultSource.ROOM : ResultSource.SOLO,
    round: event.round,
    focusedMinutes: event.focusedMinutes,
    finished: event.finished,
    baseXp: event.baseXp,
    combo: event.combo,
    xpEarned: event.xpEarned,
    capped: event.capped,
    streak: event.streak,
    streakExtended: event.streakExtended,
    finisherUserIds: event.finisherIds,
    roomDamageXp: event.roomDamageXp,
    ...(event.goalPrompt ? { goalPrompt: goalToProto(event.goalPrompt) } : {}),
    breakEndsAtMs: event.breakEndsAt,
    me: myStatusToProto(event.me),
  };
}

// ---------------------------------------------------------------- from proto

const EMPTY_PRESET: TimerPresetDto = {
  focusMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  rounds: 4,
};

const presetFromProto = (p: TimerPreset | undefined): TimerPresetDto =>
  p
    ? {
        focusMinutes: p.focusMinutes,
        breakMinutes: p.breakMinutes,
        longBreakMinutes: p.longBreakMinutes,
        rounds: p.rounds,
      }
    : EMPTY_PRESET;

const goalFromProto = (g: Goal): GoalDto => ({ id: g.id, text: g.text, done: g.done });

const bossFromProto = (b: Boss | undefined): BossDto => ({
  enabled: b?.enabled ?? false,
  name: b?.name ?? "",
  maxHpXp: b?.maxHpXp ?? 0,
  damageXp: b?.damageXp ?? 0,
  strength: b?.strength ?? 1,
  lootXp: b?.lootXp ?? 0,
  endsAt: b?.endsAtMs ?? 0,
  defeated: b?.defeated ?? false,
});

const memberFromProto = (m: MemberCard): MemberCardDto => ({
  userId: m.userId,
  status: memberStatusFromProto(m.status),
  endsAt: m.endsAtMs,
  goalText: m.goalText,
  goalPrivate: m.goalPrivate,
  level: m.level,
  streak: m.streak,
  badges: m.badges ?? [],
  cardStyle: m.cardStyle || "classic",
  weeklyRank: m.weeklyRank ?? 0,
});

export function roomFromProto(room: RoomState | undefined): RoomStateDto {
  const timer = room?.timer;
  const features = room?.features;
  return {
    serverNow: room?.serverNowMs ?? 0,
    timer: {
      phase: phaseFromProto(timer?.phase ?? Phase.IDLE),
      round: timer?.round ?? 0,
      rounds: timer?.rounds ?? 4,
      phaseStartedAt: timer?.phaseStartedAtMs ?? 0,
      phaseEndsAt: timer?.phaseEndsAtMs ?? 0,
      preset: presetFromProto(timer?.preset),
    },
    members: (room?.members ?? []).map(memberFromProto),
    presentCount: room?.presentCount ?? 0,
    roomParticipantCount: room?.roomParticipantCount ?? 0,
    combo: room?.combo ?? 1,
    boss: bossFromProto(room?.boss),
    features: {
      presetKey: PRESET_FROM_PROTO.get(features?.presetKey ?? PresetKey.STANDARD) ?? "25-5",
      xpEnabled: features?.xpEnabled ?? true,
      comboEnabled: features?.comboEnabled ?? true,
      bossEnabled: features?.bossEnabled ?? false,
      streakFreezesEnabled: features?.streakFreezesEnabled ?? true,
      goalsPublicByDefault: features?.goalsPublicByDefault ?? true,
      dailyXpCap: features?.dailyXpCap ?? 0,
      postChannelName: features?.postChannelName ?? "",
    },
    voice: {
      channelName: room?.voice?.channelName ?? "",
      joinUrl: room?.voice?.joinUrl ?? "",
      userIds: room?.voice?.userIds ?? [],
    },
  };
}

export function myStatusFromProto(me: MyStatus | undefined): MyStatusDto {
  return {
    userId: me?.userId ?? "",
    status: statusFromProto(me?.status ?? MemberStatus.IDLE),
    endsAt: me?.endsAtMs ?? 0,
    onRoomTimer: me?.onRoomTimer ?? false,
    xpTotal: me?.xpTotal ?? 0,
    level: me?.level ?? 1,
    xpIntoLevel: me?.xpIntoLevel ?? 0,
    xpForNextLevel: me?.xpForNextLevel ?? 1,
    xpToday: me?.xpToday ?? 0,
    streak: me?.streak ?? 0,
    freezeAvailable: me?.freezeAvailable ?? false,
    goals: (me?.goals ?? []).map(goalFromProto),
    goalsPrivate: me?.goalsPrivate ?? false,
    keepGoingEndsAt: me?.keepGoingEndsAtMs ?? 0,
    ...(me?.newBadgeIds.length ? { newBadges: [...me.newBadgeIds] } : {}),
  };
}

export function snapshotFromProto(snapshot: RoomSnapshot): SnapshotDto {
  return { room: roomFromProto(snapshot.room), me: myStatusFromProto(snapshot.me) };
}

const questFromProto = (q: Quest): QuestDto => ({
  id: q.id,
  title: q.title,
  progress: q.progress,
  target: q.target,
  unit: QUEST_UNIT_FROM_PROTO.get(q.unit) ?? "count",
  xp: q.xp,
  done: q.done,
});

const cardLookFromProto = (c: CardLook | undefined): CardLookDto => ({
  chosenStyle: c?.chosenStyle ?? "",
  chosenShowcase: c?.chosenShowcase ?? [],
  style: c?.style || "classic",
  showcase: c?.showcase ?? [],
});

export function progressFromProto(progress: Progress): ProgressDto {
  return {
    me: myStatusFromProto(progress.me),
    days: progress.days.map((d) => ({ day: d.day, focusMinutes: d.focusMinutes })),
    totalFocusMinutes: progress.totalFocusMinutes,
    quests: progress.quests.map(questFromProto),
    badges: (progress.badges ?? []).map((b) => ({ id: b.id, earnedAt: b.earnedAtMs })),
    card: cardLookFromProto(progress.card),
  };
}

export function leaderboardFromProto(board: Leaderboard): LeaderboardDto {
  return {
    by: leaderboardMetricFromProto(board.by) ?? "minutes",
    period: leaderboardPeriodFromProto(board.period) ?? "week",
    startDay: board.startDay,
    endsAt: board.endsAtMs,
    entries: board.entries.map((e) => ({
      userId: e.userId,
      focusMinutes: e.focusMinutes,
      xp: e.xp,
      rank: e.rank,
    })),
    me: {
      rank: board.myRank,
      focusMinutes: board.myFocusMinutes,
      xp: board.myXp,
      hidden: board.hidden,
    },
  };
}

export function memberProfileFromProto(profile: MemberProfile): MemberProfileDto {
  return {
    userId: profile.userId,
    level: profile.level,
    xpTotal: profile.xpTotal,
    xpIntoLevel: profile.xpIntoLevel,
    xpForNextLevel: profile.xpForNextLevel,
    streak: profile.streak,
    badges: (profile.badges ?? []).map((b) => ({ id: b.id, earnedAt: b.earnedAtMs })),
    showcase: profile.showcase ?? [],
    cardStyle: profile.cardStyle || "classic",
  };
}

export function phaseCompletedFromProto(event: PhaseCompletedEvent): PhaseCompletedDto {
  return {
    kind: phaseKindFromProto(event.kind),
    round: event.round,
    finisherIds: event.finisherUserIds,
    roomDamageXp: event.roomDamageXp,
    combo: event.combo,
    room: roomFromProto(event.room),
  };
}

export function personalResultFromProto(event: PersonalResultEvent): PersonalResultDto {
  return {
    source: event.source === ResultSource.SOLO ? "solo" : "room",
    round: event.round,
    focusedMinutes: event.focusedMinutes,
    finished: event.finished,
    baseXp: event.baseXp,
    combo: event.combo,
    xpEarned: event.xpEarned,
    capped: event.capped,
    streak: event.streak,
    streakExtended: event.streakExtended,
    finisherIds: event.finisherUserIds,
    roomDamageXp: event.roomDamageXp,
    goalPrompt: event.goalPrompt ? goalFromProto(event.goalPrompt) : null,
    breakEndsAt: event.breakEndsAtMs,
    me: myStatusFromProto(event.me),
  };
}
