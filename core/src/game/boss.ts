import { GAME } from "../constants";
import { daysBetween, type DayKey } from "../time/calendar";

/** A boss's name and how tough it is. HP and loot are the admin's base times strength. */
export interface BossKind {
  name: string;
  strength: number;
}

/**
 * Built-in bosses. When admins leave "Boss name" blank, each week's boss
 * takes the next one in this list, so every member sees the same boss and
 * none repeats until the list runs out (about a year). Strength fits the name:
 * small annoyances are 0.5x, exams and deadlines up to 2x. The list averages
 * exactly 1x, so over a year the base HP is what the room really faces.
 */
export const BOSSES: readonly BossKind[] = [
  { name: "The Procrastinator", strength: 1.25 },
  { name: "Captain Snooze Button", strength: 0.5 },
  { name: "The Group Project Ghost", strength: 1.25 },
  { name: "Lord of the Late Fees", strength: 1.25 },
  { name: "The All-Nighter", strength: 1.5 },
  { name: "Professor Pop Quiz", strength: 0.75 },
  { name: "Wi-Fi Dropper 3000", strength: 0.75 },
  { name: "The Unread Syllabus", strength: 1.25 },
  { name: "Count Distraction", strength: 0.75 },
  { name: "The Infinite Scroll", strength: 0.75 },
  { name: "Sir Reply-All", strength: 0.5 },
  { name: "The Blank Page", strength: 1.25 },
  { name: "Deadline Dragon", strength: 1.5 },
  { name: "The Citation Kraken", strength: 1.5 },
  { name: "Doomscroll Golem", strength: 1 },
  { name: "The 8 AM Lecture", strength: 1 },
  { name: "Baron von Burnout", strength: 1.5 },
  { name: "The Missing Semicolon", strength: 0.75 },
  { name: "Snack Break Goblin", strength: 0.5 },
  { name: "The Overdue Library Book", strength: 0.75 },
  { name: "Notification Hydra", strength: 1 },
  { name: "The Word Count Wraith", strength: 1.25 },
  { name: "Sleepy Sloth Supreme", strength: 0.75 },
  { name: "The Printer That Jams", strength: 0.5 },
  { name: "Captain Cram", strength: 1.5 },
  { name: "The Forgotten Password", strength: 0.5 },
  { name: "Mister Five More Minutes", strength: 0.75 },
  { name: "The Typo Troll", strength: 0.5 },
  { name: "The Excuse Generator", strength: 0.75 },
  { name: "The Messy Desk Monster", strength: 0.75 },
  { name: "The Laptop at 1% Battery", strength: 0.75 },
  { name: "Queen of Open Tabs", strength: 0.75 },
  { name: "The Exam Room Echo", strength: 1.25 },
  { name: "Duke of Due Tomorrow", strength: 1 },
  { name: "The Thesis Defense", strength: 2 },
  { name: "The Auto-Correct Imp", strength: 0.5 },
  { name: "Lord Lo-Fi Beats", strength: 0.5 },
  { name: "The Lost Lecture Notes", strength: 1 },
  { name: "The Phantom Assignment", strength: 1.25 },
  { name: "Major Mental Block", strength: 1 },
  { name: "The Coffee Spill", strength: 0.5 },
  { name: "Sir Skips-a-Lot", strength: 0.75 },
  { name: "The Endless Reading List", strength: 1.5 },
  { name: "Emperor Eraser Crumbs", strength: 0.5 },
  { name: "The Last-Minute Lich", strength: 2 },
  { name: "Professor Plot Twist", strength: 1 },
  { name: "The Calculator Gremlin", strength: 0.5 },
  { name: "The Group Chat Swarm", strength: 1 },
  { name: "Commander Couldn't Even", strength: 0.75 },
  { name: "The Bibliography Beast", strength: 1.5 },
  { name: "The Midterm Minotaur", strength: 1.5 },
  { name: "The Final Final Exam", strength: 2 },
];

/**
 * Strength for a name an admin typed. Words that sound like a big exam make a
 * tougher boss, so "Finals" beats "Midterms" and both beat "Pop quiz".
 */
const CUSTOM_STRENGTHS: readonly { pattern: RegExp; strength: number }[] = [
  { pattern: /\b(finals?|thesis|dissertation|bar exam|boards?)\b/i, strength: 2 },
  { pattern: /\b(midterms?|exams?|deadline|project)\b/i, strength: 1.5 },
  { pattern: /\b(quiz(zes)?|homework|worksheet)\b/i, strength: 0.75 },
];

/** Strength for any boss name: the built-in list first, then keywords, else 1x. */
export function bossStrength(name: string): number {
  const builtIn = BOSSES.find((b) => b.name === name);
  if (builtIn) return builtIn.strength;
  return CUSTOM_STRENGTHS.find((c) => c.pattern.test(name))?.strength ?? 1;
}

/** Monday 1970-01-05, the first week counted. */
const FIRST_WEEK: DayKey = "1970-01-05";

/** The boss name for a week: the admin's name if set, otherwise the week's built-in name. */
export function bossNameFor(week: DayKey, customName: string): string {
  if (customName.length > 0) return customName;
  const weekNumber = Math.floor(daysBetween(FIRST_WEEK, week) / 7);
  const n = BOSSES.length;
  return BOSSES[((weekNumber % n) + n) % n]!.name;
}

/**
 * HP and damage are in XP: focus deals the XP it earns, before the daily cap.
 * Every amount is a whole number of XP.
 */
export interface BossState {
  weekKey: DayKey;
  name: string;
  maxHpXp: number;
  damageXp: number;
  defeatedAt: number | null;
  contributorIds: string[];
}

/** The boss's HP: the admin's base HP scaled by the boss's strength. */
export function bossMaxHp(name: string, baseHpXp: number): number {
  return Math.max(1, Math.round(baseHpXp * bossStrength(name)));
}

/** XP each contributor gets for a defeat. Stronger bosses drop more. */
export function bossLootXp(name: string): number {
  return Math.round(GAME.bossLootXp * bossStrength(name));
}

export function newBoss(week: DayKey, name: string, baseHpXp: number): BossState {
  return {
    weekKey: week,
    name,
    maxHpXp: bossMaxHp(name, baseHpXp),
    damageXp: 0,
    defeatedAt: null,
    contributorIds: [],
  };
}

export interface DamageResult {
  boss: BossState;
  defeatedNow: boolean;
}

export function applyDamage(
  boss: BossState,
  xp: number,
  contributorIds: readonly string[],
  now: number,
): DamageResult {
  const hit = Math.round(xp);
  if (hit <= 0 || boss.defeatedAt !== null) return { boss, defeatedNow: false };
  const damageXp = Math.min(boss.maxHpXp, boss.damageXp + hit);
  const contributors = new Set([...boss.contributorIds, ...contributorIds]);
  const defeatedNow = damageXp >= boss.maxHpXp;
  return {
    boss: {
      ...boss,
      damageXp,
      contributorIds: [...contributors],
      defeatedAt: defeatedNow ? now : null,
    },
    defeatedNow,
  };
}

export function bossHpLeft(boss: BossState): number {
  return Math.max(0, boss.maxHpXp - boss.damageXp);
}

/**
 * Apply a settings change to this week's boss. Damage is never healed and a
 * defeated boss stays defeated. Lowering HP below the damage dealt defeats it.
 */
export function reconfigureBoss(
  boss: BossState,
  name: string,
  baseHpXp: number,
  now: number,
): DamageResult {
  if (boss.defeatedAt !== null) return { boss: { ...boss, name }, defeatedNow: false };
  const maxHpXp = bossMaxHp(name, baseHpXp);
  const defeatedNow = boss.damageXp >= maxHpXp;
  return {
    boss: {
      ...boss,
      name,
      maxHpXp,
      damageXp: Math.min(boss.damageXp, maxHpXp),
      defeatedAt: defeatedNow ? now : null,
    },
    defeatedNow,
  };
}
