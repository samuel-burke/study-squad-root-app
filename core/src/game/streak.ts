import { addDays, daysBetween, weekKey, type DayKey } from "../time/calendar";

/**
 * Streaks without guilt: a day counts after one finished session, and each
 * week has one free "freeze" that covers a single missed day.
 */
export interface StreakState {
  streak: number;
  lastActiveDay: DayKey | null;
  /** Week keys (Mondays) whose freeze has been spent. Only recent weeks are kept. */
  freezeWeeksUsed: DayKey[];
}

export const EMPTY_STREAK: StreakState = { streak: 0, lastActiveDay: null, freezeWeeksUsed: [] };

const FREEZE_HISTORY_WEEKS = 8;

/**
 * Freezes needed to bridge every missed day between the last active day and
 * `today`, or null if the gap can't be bridged.
 */
function bridgeGap(state: StreakState, today: DayKey, freezesEnabled: boolean): DayKey[] | null {
  if (!state.lastActiveDay) return null;
  const gap = daysBetween(state.lastActiveDay, today);
  if (gap <= 1) return [];
  if (!freezesEnabled) return null;
  const used = new Set(state.freezeWeeksUsed);
  const spent: DayKey[] = [];
  for (let offset = 1; offset < gap; offset++) {
    const week = weekKey(addDays(state.lastActiveDay, offset));
    if (used.has(week)) return null;
    used.add(week);
    spent.push(week);
  }
  return spent;
}

export interface StreakUpdate {
  state: StreakState;
  /** True when this activity made the streak longer. */
  extended: boolean;
  freezesSpent: number;
}

export function recordActiveDay(
  state: StreakState,
  today: DayKey,
  freezesEnabled: boolean,
): StreakUpdate {
  if (state.lastActiveDay === today) return { state, extended: false, freezesSpent: 0 };
  if (state.lastActiveDay && daysBetween(state.lastActiveDay, today) < 0) {
    // Clock went backwards (or a late write). Never shorten a streak because of it.
    return { state, extended: false, freezesSpent: 0 };
  }
  const spent = bridgeGap(state, today, freezesEnabled);
  const streak = spent === null ? 1 : state.streak + 1;
  const freezeWeeksUsed = [...state.freezeWeeksUsed, ...(spent ?? [])]
    .sort()
    .slice(-FREEZE_HISTORY_WEEKS);
  return {
    state: { streak, lastActiveDay: today, freezeWeeksUsed },
    extended: true,
    freezesSpent: spent?.length ?? 0,
  };
}

/** The streak as it stands today, counting freezes that could still save it. */
export function currentStreak(state: StreakState, today: DayKey, freezesEnabled: boolean): number {
  if (!state.lastActiveDay) return 0;
  if (state.lastActiveDay === today) return state.streak;
  // Yesterday (gap 1) is still alive; today just hasn't counted yet.
  // Longer gaps survive only if freezes can cover every missed day before today.
  const spent = bridgeGap(state, today, freezesEnabled);
  return spent === null ? 0 : state.streak;
}

export function freezeAvailable(
  state: StreakState,
  today: DayKey,
  freezesEnabled: boolean,
): boolean {
  if (!freezesEnabled) return false;
  const week = weekKey(today);
  if (state.freezeWeeksUsed.includes(week)) return false;
  // A missed day this week that is keeping the streak alive has already
  // claimed this week's freeze, even though it is only written down once the
  // next session finishes.
  const pending = bridgeGap(state, today, freezesEnabled) ?? [];
  return !pending.includes(week);
}
