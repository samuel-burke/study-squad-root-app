import { describe, expect, it } from "vitest";
import { openDatabase } from "../src/persistence/database";
import { migrateToLatest, migratorConfig, rollbackAll } from "../src/persistence/migrations";

describe("migrations", () => {
  it("migrates up idempotently and rolls back cleanly", async () => {
    const db = openDatabase(":memory:");
    try {
      await migrateToLatest(db);
      await migrateToLatest(db);
      const tables = async () =>
        (
          await db.raw(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'knex_%' AND name NOT LIKE 'sqlite_%'",
          )
        )
          .map((r: { name: string }) => r.name)
          .sort();
      expect(await tables()).toEqual([
        "bosses",
        "daily_stats",
        "goals",
        "kv",
        "leaderboard_opt_outs",
        "member_badges",
        "member_cards",
        "members",
        "quest_rewards",
        "room_cycle",
        "room_participants",
        "session_log",
        "solo_sessions",
      ]);
      await rollbackAll(db);
      expect(await tables()).toEqual([]);
    } finally {
      await db.destroy();
    }
  });

  it("converts a boss mid-week from focus minutes to XP", async () => {
    const db = openDatabase(":memory:");
    try {
      await db.migrate.up({ ...migratorConfig, name: "001_initial" });
      await db("bosses").insert({
        week_key: "2026-10-26",
        name: "Midterms",
        max_hp_minutes: 6000,
        damage_minutes: 1500.3,
      });
      await migrateToLatest(db);
      expect(await db("bosses").first()).toMatchObject({ max_hp_xp: 12_000, damage_xp: 3001 });
      await db.migrate.down(migratorConfig); // 008_live_stats
      await db.migrate.down(migratorConfig); // 007_live_boss_damage
      await db.migrate.down(migratorConfig); // 006_boss_xp
      expect(await db("bosses").first()).toMatchObject({
        max_hp_minutes: 6000,
        damage_minutes: 1500.5,
      });
    } finally {
      await db.destroy();
    }
  });
});
