import { describe, expect, it } from "vitest";
import {
  applyDamage,
  BOSSES,
  bossLootXp,
  bossNameFor,
  baseFocusXp,
  bossHpLeft,
  bossStrength,
  comboFor,
  formatCombo,
  focusXp,
  levelFromXp,
  newBoss,
  reconfigureBoss,
  xpForLevel,
} from "../src";

describe("comboFor", () => {
  it("starts at 1.0x and adds 0.1x per extra person", () => {
    expect(comboFor(0)).toBe(1);
    expect(comboFor(1)).toBe(1);
    expect(comboFor(6)).toBe(1.5);
    expect(formatCombo(comboFor(6))).toBe("1.5x");
  });

  it("caps at 2.0x", () => {
    expect(comboFor(11)).toBe(2);
    expect(comboFor(500)).toBe(2);
  });

  it("is always 1.0x when admins turn it off", () => {
    expect(comboFor(8, false)).toBe(1);
  });
});

describe("XP", () => {
  it("matches the design's break screen: 25 minutes at 1.5x is 50 base, 75 earned", () => {
    expect(baseFocusXp(25)).toBe(50);
    expect(focusXp(25, 1.5)).toBe(75);
  });

  it("only counts whole minutes", () => {
    expect(baseFocusXp(4.99)).toBe(8);
  });

  it("needs 500 XP at level 7, like the design", () => {
    expect(xpForLevel(7)).toBe(500);
  });

  it("derives level progress from total XP", () => {
    expect(levelFromXp(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 200 });
    expect(levelFromXp(199).level).toBe(1);
    expect(levelFromXp(200)).toEqual({ level: 2, xpIntoLevel: 0, xpForNextLevel: 250 });
    // Levels 1-6 need 200+250+300+350+400+450 = 1950.
    expect(levelFromXp(1950 + 415)).toEqual({ level: 7, xpIntoLevel: 415, xpForNextLevel: 500 });
    expect(levelFromXp(-10).level).toBe(1);
  });
});

describe("boss", () => {
  // Doomscroll Golem is a 1x boss, so HP is the base.
  const boss = newBoss("2026-10-26", "Doomscroll Golem", 6000);

  it("starts with the base HP times its strength", () => {
    expect(boss.maxHpXp).toBe(6000);
    expect(bossHpLeft(boss)).toBe(6000);
    expect(newBoss("w", "The Midterm Minotaur", 6000).maxHpXp).toBe(9000);
    expect(newBoss("w", "The Final Final Exam", 6000).maxHpXp).toBe(12_000);
  });

  it("takes damage and tracks contributors once each", () => {
    const first = applyDamage(boss, 225, ["a", "b"], 1);
    const second = applyDamage(first.boss, 30, ["b", "c"], 2);
    expect(second.boss.damageXp).toBe(255);
    expect(second.boss.contributorIds.sort()).toEqual(["a", "b", "c"]);
    expect(second.defeatedNow).toBe(false);
  });

  it("is defeated exactly once and never overkilled", () => {
    const small = newBoss("w", "Doomscroll Golem", 60);
    const hit = applyDamage(small, 90, ["a"], 5);
    expect(hit.defeatedNow).toBe(true);
    expect(hit.boss.damageXp).toBe(60);
    expect(hit.boss.defeatedAt).toBe(5);
    const again = applyDamage(hit.boss, 10, ["b"], 6);
    expect(again.defeatedNow).toBe(false);
    expect(again.boss).toBe(hit.boss);
  });

  it("ignores zero or negative damage", () => {
    expect(applyDamage(boss, 0, ["a"], 1).boss).toBe(boss);
    expect(applyDamage(boss, -5, ["a"], 1).boss).toBe(boss);
  });

  describe("reconfigureBoss", () => {
    it("renames and resizes without healing", () => {
      const hurt = applyDamage(boss, 600, ["a"], 1).boss;
      const result = reconfigureBoss(hurt, "The Final Final Exam", 1500, 2);
      expect(result.boss.name).toBe("The Final Final Exam");
      expect(result.boss.maxHpXp).toBe(3000);
      expect(result.boss.damageXp).toBe(600);
      expect(result.defeatedNow).toBe(false);
    });

    it("defeats the boss when HP drops below damage dealt", () => {
      const hurt = applyDamage(boss, 600, ["a"], 1).boss;
      const result = reconfigureBoss(hurt, "The Midterm Minotaur", 200, 2);
      expect(result.defeatedNow).toBe(true);
      expect(result.boss.damageXp).toBe(300);
    });

    it("keeps a defeated boss defeated", () => {
      const dead = applyDamage(newBoss("w", "Doomscroll Golem", 60), 60, ["a"], 1).boss;
      const result = reconfigureBoss(dead, "Captain Cram", 100, 2);
      expect(result.boss.defeatedAt).toBe(1);
      expect(result.boss.maxHpXp).toBe(60);
      expect(result.defeatedNow).toBe(false);
    });
  });
});

describe("bossStrength", () => {
  it("makes exams tougher than quizzes", () => {
    expect(bossStrength("The Final Final Exam")).toBe(2);
    expect(bossStrength("The Midterm Minotaur")).toBe(1.5);
    expect(bossStrength("Professor Pop Quiz")).toBe(0.75);
    expect(bossStrength("Snack Break Goblin")).toBe(0.5);
  });

  it("treats a name not on the list, like an old custom name, as 1x", () => {
    expect(bossStrength("Finals")).toBe(1);
    expect(bossStrength("Calc II")).toBe(1);
  });

  it("averages exactly 1x across the built-in list", () => {
    const mean = BOSSES.reduce((sum, b) => sum + b.strength, 0) / BOSSES.length;
    expect(mean).toBeCloseTo(1, 10);
    expect(BOSSES.some((b) => b.strength < 1)).toBe(true);
    expect(BOSSES.some((b) => b.strength > 1)).toBe(true);
  });

  it("keeps every built-in boss between 0.5x and 2x", () => {
    for (const b of BOSSES) {
      expect(b.strength).toBeGreaterThanOrEqual(0.5);
      expect(b.strength).toBeLessThanOrEqual(2);
    }
  });

  it("scales loot with strength", () => {
    expect(bossLootXp("Calc II")).toBe(100);
    expect(bossLootXp("Professor Pop Quiz")).toBe(75);
    expect(bossLootXp("The Final Final Exam")).toBe(200);
  });
});

describe("whole XP", () => {
  const combos = Array.from({ length: 12 }, (_, people) => comboFor(people + 1));
  const minutes = [0.4, 1, 7.5, 12.3, 25, 49.99, 50, 180];
  const isWhole = (n: number) => expect(Number.isInteger(n), String(n)).toBe(true);

  it("rounds focus XP for every combo step", () => {
    for (const combo of combos) for (const m of minutes) isWhole(focusXp(m, combo));
    for (const m of minutes) isWhole(baseFocusXp(m));
  });

  it("rounds every boss's HP and loot for any base HP", () => {
    for (const { name } of BOSSES) {
      for (const base of [100, 333, 1000, 2501, 10_000, 99_999]) {
        isWhole(newBoss("w", name, base).maxHpXp);
        isWhole(reconfigureBoss(newBoss("w", name, 500), name, base, 1).boss.maxHpXp);
      }
      isWhole(bossLootXp(name));
    }
  });

  it("rounds damage, even a fractional hit", () => {
    const hit = applyDamage(newBoss("w", "Calc II", 1000), 12.6, ["a"], 1).boss;
    expect(hit.damageXp).toBe(13);
    expect(bossHpLeft(hit)).toBe(987);
  });
});

describe("bossNameFor", () => {
  it("gives every week a built-in name and moves to the next one each Monday", () => {
    const names = BOSSES.map((b) => b.name);
    const first = names.indexOf(bossNameFor("2026-10-26"));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(bossNameFor("2026-11-02")).toBe(names[(first + 1) % names.length]);
  });

  it("does not repeat a name until the list runs out", () => {
    const names = new Set<string>();
    for (let week = 0; week < BOSSES.length; week++) {
      const monday = new Date(Date.UTC(2026, 9, 26) + week * 7 * 86_400_000);
      names.add(bossNameFor(monday.toISOString().slice(0, 10)));
    }
    expect(names.size).toBe(BOSSES.length);
  });

  it("only has names that fit the 40-character limit", () => {
    expect(new Set(BOSSES.map((b) => b.name)).size).toBe(BOSSES.length);
    for (const { name } of BOSSES) expect(name.length).toBeLessThanOrEqual(40);
  });
});
