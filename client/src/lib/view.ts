import {
  formatCountdown,
  MAIN_TABLE_ID,
  type MemberCardDto,
  type MyStatusDto,
  type RoomStateDto,
  type RoomTimerDto,
} from "@studyroom/core";

/** A table's name for the board. The main table has none of its own. */
export function tableName(table: { id: string; name: string }): string {
  return table.id === MAIN_TABLE_ID ? "Main table" : table.name;
}

/**
 * The room as you see it: `timer` is your own table's timer while you sit at
 * one, so the header, the hero timer and the sounds all follow your table.
 */
export function myTableView(room: RoomStateDto, me: Pick<MyStatusDto, "tableId">): RoomStateDto {
  const mine = room.tables.find((t) => t.id === me.tableId);
  return mine ? { ...room, timer: mine.timer } : room;
}

export type Tone = "room" | "solo" | "break";

/** The status chip on a member card: "Room timer · 14:32", "Solo · 38:10", "Break · back in 3:12". */
export function statusChip(
  member: Pick<MemberCardDto, "status" | "endsAt"> & { tableId?: string },
  now: number,
  tables?: ReadonlyMap<string, string>,
): { label: string; tone: Tone } {
  const left = formatCountdown(member.endsAt - now);
  switch (member.status) {
    case "roomFocus":
      return {
        label: `${tables?.get(member.tableId ?? "") ?? "Room timer"} · ${left}`,
        tone: "room",
      };
    case "soloFocus":
      return { label: `Solo · ${left}`, tone: "solo" };
    case "roomBreak":
    case "soloBreak":
      return { label: `Break · back in ${left}`, tone: "break" };
  }
}

/** The short status on a mobile row: "Room", "Solo 38:10", "Break 3:12". */
export function rowTime(
  member: Pick<MemberCardDto, "status" | "endsAt"> & { tableId?: string },
  now: number,
  tables?: ReadonlyMap<string, string>,
): string {
  const left = formatCountdown(member.endsAt - now);
  switch (member.status) {
    case "roomFocus":
      return tables?.get(member.tableId ?? "") ?? "Room";
    case "soloFocus":
      return `Solo ${left}`;
    case "roomBreak":
    case "soloBreak":
      return `Break ${left}`;
  }
}

export function isFocusing(member: Pick<MemberCardDto, "status">): boolean {
  return member.status === "roomFocus" || member.status === "soloFocus";
}

/** Header pill, e.g. "Focus · round 2 of 4". */
export function phasePill(timer: RoomTimerDto): string {
  switch (timer.phase) {
    case "idle":
      return "Room timer is free";
    case "focus":
      return `Focus · round ${timer.round} of ${timer.rounds}`;
    case "break":
      return `Break · round ${timer.round} of ${timer.rounds}`;
    case "longBreak":
      return "Long break";
  }
}

export function phaseCaption(timer: RoomTimerDto): string {
  switch (timer.phase) {
    case "idle":
      return "ready when you are";
    case "focus":
      return "left in focus";
    case "break":
      return "left in break";
    case "longBreak":
      return "left in long break";
  }
}

/** What happens when the current phase ends. */
export function nextLabel(timer: RoomTimerDto): string {
  const { preset } = timer;
  switch (timer.phase) {
    case "idle":
      return "Join to start round 1 for everyone";
    case "focus":
      return timer.round === timer.rounds
        ? `Next: ${preset.longBreakMinutes} minute long break for everyone`
        : `Next: ${preset.breakMinutes} minute break for everyone`;
    case "break":
      return `Next: round ${timer.round + 1} of ${timer.rounds}`;
    case "longBreak":
      return "Next: a fresh cycle for anyone still here";
  }
}

/** Fraction of the current phase that is left, from 1 (just started) to 0. */
export function remainingFraction(timer: RoomTimerDto, now: number): number {
  const total = timer.phaseEndsAt - timer.phaseStartedAt;
  if (timer.phase === "idle" || total <= 0) return 1;
  return Math.min(1, Math.max(0, (timer.phaseEndsAt - now) / total));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

const AVATAR_COLORS = [
  "#3B4F8C",
  "#7A4A8C",
  "#2F6F6A",
  "#8C5A2F",
  "#355E8C",
  "#8C3B4F",
  "#4F3B8C",
  "#5B6B2E",
];

/** A stable color per user, from the design's avatar palette. */
export function avatarColor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

/** Heatmap shade 0-3 for a day's focus minutes. */
export function heatLevel(minutes: number): 0 | 1 | 2 | 3 {
  if (minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 90) return 2;
  return 3;
}

/**
 * Days in the heatmap that a freeze is covering: missed days inside the
 * current streak. Walks back from today (which only counts once a session is
 * finished) until it has passed `streak` counted days; the other days on the way
 * were bridged by a freeze, including one still waiting for the next session.
 */
export function freezeDays(
  days: readonly { day: string; counted: boolean }[],
  streak: number,
): Set<string> {
  const frozen = new Set<string>();
  let i = days.length - 1;
  if (i >= 0 && !days[i]!.counted) i--;
  let counted = 0;
  const gaps: string[] = [];
  for (; i >= 0 && counted < streak; i--) {
    const d = days[i]!;
    if (d.counted) {
      counted++;
      for (const gap of gaps.splice(0)) frozen.add(gap);
    } else {
      gaps.push(d.day);
    }
  }
  return frozen;
}

export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, part / whole)) * 100);
}

/** How long a finished goal took, from adding it to ticking it off: "45m", "2h 10m", "3d 4h". */
export function goalDuration(createdAt: number, completedAt: number): string {
  const minutes = Math.floor(Math.max(0, completedAt - createdAt) / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
}
