import { formatCombo } from "./game/combo";
import { formatHours, formatXp, pluralize } from "./format";
import type { BreakRecapDto, RecapDto } from "./dto";
import { KEEP_GOING_FOOTER, type SquadEvent } from "./squad/squadLines";

/**
 * Text for the posts Study Squad drops into a Root channel. Names passed in
 * must already be cleaned with safeDisplayName.
 */

export function busyRoomPost(focusingCount: number, combo: number): string {
  return `📚 ${focusingCount} people are focusing right now. Combo is at ${formatCombo(combo)}. Open Study Squad to join the room timer.`;
}

export function streakMilestonePost(name: string, streak: number): string {
  return `🔥 ${name} just hit a ${streak} day streak.`;
}

export function bossDefeatedPost(
  bossName: string,
  contributorCount: number,
  lootXp: number,
): string {
  const loot = lootXp > 0 ? ` Everyone who pitched in earned +${lootXp} XP.` : "";
  return `⚔️ The room defeated ${bossName}! ${pluralize(contributorCount, "person", "people")} dealt damage this week.${loot}`;
}

export function dailyRecapPost(recap: RecapDto, names: ReadonlyMap<string, string>): string {
  const lines = [
    `${recap.weekday} recap`,
    `${formatHours(recap.focusMinutes)} focused as a community · ${pluralize(recap.goalsDone, "goal")} finished · ${pluralize(recap.activeMembers, "member")} showed up`,
  ];
  if (recap.boss) {
    lines.push(
      recap.boss.defeated
        ? `${recap.boss.name}: defeated 🎉`
        : `${recap.boss.name}: down to ${formatXp(recap.boss.hpLeftXp)} HP · ${pluralize(recap.boss.daysLeft, "day")} left`,
    );
  }
  if (recap.topStreaks.length > 0) {
    const streaks = recap.topStreaks.map((s) => `${names.get(s.userId) ?? "Someone"} ${s.streak}`);
    lines.push(`Top streaks: ${streaks.join(" · ")}`);
  }
  if (recap.topFocus.length > 0) {
    const leaders = recap.topFocus.map(
      (f, i) => `${i + 1}. ${names.get(f.userId) ?? "Someone"} ${formatHours(f.focusMinutes)}`,
    );
    lines.push(`This week: ${leaders.join(" · ")}`);
  }
  return lines.join("\n");
}

/** Mentions shown before the rest are summed up, so a full room doesn't flood the post. */
export const SQUAD_MAX_MENTIONS = 10;

/**
 * A squad bot post: who it's for, then what the bot says. `mentions` are
 * ready-made mention tags (or cleaned names) for the first few of
 * `memberCount` people.
 */
export function squadPost(
  event: SquadEvent,
  text: string,
  mentions: readonly string[],
  memberCount: number,
  heading?: string,
  recapLines: readonly string[] = [],
): string {
  const shown = mentions.slice(0, SQUAD_MAX_MENTIONS);
  const extra = Math.max(0, memberCount - shown.length);
  const who = extra > 0 ? `${shown.join(" ")} and ${pluralize(extra, "other")}` : shown.join(" ");
  const footer = event === "sessionCompleted" ? ` ${KEEP_GOING_FOOTER}` : "";
  const body = `${who} ${text}${footer}`.trim();
  return [...(heading ? [heading] : []), body, ...recapLines].join("\n");
}

/**
 * Lines summing up the break that just ended, for the back-to-study post.
 * `names` has a cleaned name for everyone in `recap.highFives`.
 */
export function breakRecapLines(
  recap: BreakRecapDto,
  names: ReadonlyMap<string, string>,
): string[] {
  const lines: string[] = [];
  if (recap.challengeDone > 0) {
    lines.push(
      `✅ ${pluralize(recap.challengeDone, "person", "people")} did the break challenge: ${recap.challenge}`,
    );
  }
  if (recap.highFives.length > 0) {
    const top = recap.highFives.map((h) => `${names.get(h.userId) ?? "Someone"} ${h.count}`);
    lines.push(`👋 High-fives: ${top.join(" · ")}`);
  }
  return lines;
}

/** One member's line in a badge roundup: their mention tag or cleaned name, and the badges. */
export interface BadgeRoundupLine {
  who: string;
  badges: string;
}

/**
 * One squad bot post for everyone who unlocked badges at the same moment,
 * such as the end of a busy round, so a full room doesn't get a post each.
 * Shows the first few members and counts the rest.
 */
export function badgeRoundupPost(lines: readonly BadgeRoundupLine[], memberCount: number): string {
  const shown = lines.slice(0, SQUAD_MAX_MENTIONS);
  const extra = Math.max(0, memberCount - shown.length);
  const rows = shown.map((l) => `${l.who}: ${l.badges}`);
  if (extra > 0) rows.push(`…and ${pluralize(extra, "other")} unlocked badges too.`);
  return [`🏅 New badges for ${pluralize(memberCount, "person", "people")}`, ...rows].join("\n");
}

/**
 * The first line of a timer post, so it's clear at a glance whether it's
 * study time or a break, even when the bot posts a movie line. Join and badge
 * posts aren't about the timer and get none.
 */
export function squadHeading(
  event: SquadEvent,
  round: number,
  rounds?: number,
): string | undefined {
  switch (event) {
    case "sessionStarted":
    case "studyResumed":
      return rounds ? `📚 Focus · Round ${round} of ${rounds}` : `📚 Focus · Round ${round}`;
    case "breakStarted":
      return "☕ Break";
    case "sessionCompleted":
      return "🛋️ Long break";
    default:
      return undefined;
  }
}
