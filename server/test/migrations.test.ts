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
        "feedback",
        "goals",
        "kv",
        "leaderboard_opt_outs",
        "member_badges",
        "member_cards",
        "members",
        "quest_rewards",
        "room_participants",
        "room_tables",
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
      await db.migrate.down(migratorConfig); // 011_study_tables
      await db.migrate.down(migratorConfig); // 010_goal_order
      await db.migrate.down(migratorConfig); // 009_feedback
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

  it("turns a running room cycle into the main table, and back", async () => {
    const db = openDatabase(":memory:");
    try {
      await db.migrate.up({ ...migratorConfig, name: "001_initial" });
      // Up to 010_goal_order, one migration at a time.
      for (let i = 2; i <= 10; i++) await db.migrate.up(migratorConfig);
      await db("room_cycle").insert({
        id: 1,
        cycle_started_at: 1_000,
        preset: '{"focusMinutes":25}',
        settled_count: 2,
      });
      await db("room_participants").insert({ user_id: "ana", joined_at: 1_000 });
      await migrateToLatest(db);
      expect(await db("room_tables").select()).toEqual([
        {
          table_id: "main",
          name: "",
          cycle_started_at: 1_000,
          preset: '{"focusMinutes":25}',
          settled_count: 2,
        },
      ]);
      expect(await db("room_participants").first()).toMatchObject({
        user_id: "ana",
        table_id: "main",
      });
      await db("room_tables").insert({
        table_id: "t1",
        name: "Calc II",
        cycle_started_at: 2_000,
        preset: "{}",
        settled_count: 0,
      });
      await db("room_participants").insert({ user_id: "kai", joined_at: 2_000, table_id: "t1" });
      await db.migrate.down(migratorConfig);
      expect(await db("room_cycle").select()).toEqual([
        { id: 1, cycle_started_at: 1_000, preset: '{"focusMinutes":25}', settled_count: 2 },
      ]);
      expect(await db("room_participants").select("user_id")).toEqual([{ user_id: "ana" }]);
    } finally {
      await db.destroy();
    }
  });

  it("keeps existing goals in the order they were added", async () => {
    const db = openDatabase(":memory:");
    try {
      await db.migrate.up({ ...migratorConfig, name: "001_initial" });
      // Up to 009_feedback, one migration at a time.
      for (let i = 2; i <= 9; i++) await db.migrate.up(migratorConfig);
      await db("goals").insert([
        { id: "a", user_id: "ana", text: "A", done: false, xp_awarded: false, created_at: 200 },
        { id: "b", user_id: "ana", text: "B", done: false, xp_awarded: false, created_at: 100 },
      ]);
      await migrateToLatest(db);
      expect(await db("goals").select("id", "sort_key").orderBy("id")).toEqual([
        { id: "a", sort_key: 200 },
        { id: "b", sort_key: 100 },
      ]);
    } finally {
      await db.destroy();
    }
  });
});
