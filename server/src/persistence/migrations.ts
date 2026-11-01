import type { Knex } from "knex";

/** XP per focus minute when 006_boss_xp shipped. Frozen here so the migration never changes. */
const XP_PER_MINUTE_AT_006 = 2;

/**
 * Schema migrations, defined in code so they ship inside server/dist with no
 * extra files to package. Append new migrations; never edit a released one.
 */
interface Migration {
  name: string;
  up(db: Knex): Promise<void>;
  down(db: Knex): Promise<void>;
}

const migrations: Migration[] = [
  {
    name: "001_initial",
    async up(db) {
      await db.schema.createTable("members", (t) => {
        t.string("user_id").primary();
        t.integer("xp_total").notNullable().defaultTo(0);
        t.integer("streak").notNullable().defaultTo(0);
        t.string("last_active_day").nullable().index();
        t.text("freeze_weeks_used").notNullable().defaultTo("[]");
        t.boolean("goals_private").nullable();
      });
      await db.schema.createTable("goals", (t) => {
        t.string("id").primary();
        t.string("user_id").notNullable();
        t.string("text", 140).notNullable();
        t.boolean("done").notNullable().defaultTo(false);
        t.boolean("xp_awarded").notNullable().defaultTo(false);
        t.bigInteger("created_at").notNullable();
        t.bigInteger("completed_at").nullable();
        t.index(["user_id", "done"]);
      });
      await db.schema.createTable("solo_sessions", (t) => {
        t.string("user_id").primary();
        t.bigInteger("started_at").notNullable();
        t.bigInteger("ends_at").notNullable();
        t.double("minutes").notNullable();
        t.string("phase").notNullable();
        t.bigInteger("break_ends_at").notNullable();
      });
      await db.schema.createTable("room_cycle", (t) => {
        t.integer("id").primary();
        t.bigInteger("cycle_started_at").notNullable();
        t.text("preset").notNullable();
        t.integer("settled_count").notNullable().defaultTo(0);
      });
      await db.schema.createTable("room_participants", (t) => {
        t.string("user_id").primary();
        t.bigInteger("joined_at").notNullable();
      });
      await db.schema.createTable("session_log", (t) => {
        t.increments("id");
        t.string("user_id").notNullable().index();
        t.string("kind").notNullable();
        t.bigInteger("started_at").notNullable();
        t.bigInteger("ended_at").notNullable();
        t.double("focused_minutes").notNullable();
        t.boolean("finished").notNullable();
        t.integer("xp").notNullable();
        t.double("combo").notNullable();
      });
      await db.schema.createTable("daily_stats", (t) => {
        t.string("user_id").notNullable();
        t.string("day").notNullable().index();
        t.double("focus_minutes").notNullable().defaultTo(0);
        t.integer("xp").notNullable().defaultTo(0);
        t.integer("goals_done").notNullable().defaultTo(0);
        t.integer("sessions_finished").notNullable().defaultTo(0);
        t.primary(["user_id", "day"]);
      });
      await db.schema.createTable("bosses", (t) => {
        t.string("week_key").primary();
        t.string("name").notNullable();
        t.double("max_hp_minutes").notNullable();
        t.double("damage_minutes").notNullable().defaultTo(0);
        t.bigInteger("defeated_at").nullable();
        t.text("contributor_ids").notNullable().defaultTo("[]");
      });
      await db.schema.createTable("kv", (t) => {
        t.string("key").primary();
        t.text("value").notNullable();
      });
    },
    async down(db) {
      for (const table of [
        "kv",
        "bosses",
        "daily_stats",
        "session_log",
        "room_participants",
        "room_cycle",
        "solo_sessions",
        "goals",
        "members",
      ]) {
        await db.schema.dropTableIfExists(table);
      }
    },
  },
  {
    // Progress toward badges is read from daily_stats, session_log and bosses;
    // these only record which badges were earned and how each card looks.
    name: "002_badges",
    async up(db) {
      await db.schema.createTable("member_badges", (t) => {
        t.string("user_id").notNullable();
        t.string("badge_id").notNullable();
        t.bigInteger("earned_at").notNullable();
        t.primary(["user_id", "badge_id"]);
      });
      await db.schema.createTable("member_cards", (t) => {
        t.string("user_id").primary();
        t.string("style").nullable();
        t.text("showcase").nullable();
      });
    },
    async down(db) {
      await db.schema.dropTableIfExists("member_cards");
      await db.schema.dropTableIfExists("member_badges");
    },
  },
  {
    // Progress itself is read from session_log and daily_stats; this only
    // records which weekly quest rewards were paid, so each is paid once.
    name: "003_quest_rewards",
    async up(db) {
      await db.schema.createTable("quest_rewards", (t) => {
        t.string("user_id").notNullable();
        t.string("week_key").notNullable();
        t.string("quest_id").notNullable();
        t.integer("xp").notNullable();
        t.bigInteger("rewarded_at").notNullable();
        t.primary(["user_id", "week_key", "quest_id"]);
      });
    },
    async down(db) {
      await db.schema.dropTableIfExists("quest_rewards");
    },
  },
  {
    name: "004_leaderboard_opt_outs",
    async up(db) {
      // A row means the member hid themselves from the weekly leaderboard.
      await db.schema.createTable("leaderboard_opt_outs", (t) => {
        t.string("user_id").primary();
      });
    },
    async down(db) {
      await db.schema.dropTableIfExists("leaderboard_opt_outs");
    },
  },
  {
    name: "005_keep_going",
    async up(db) {
      await db.schema.alterTable("room_participants", (t) => {
        t.boolean("keep_going").notNullable().defaultTo(false);
      });
    },
    async down(db) {
      await db.schema.alterTable("room_participants", (t) => {
        t.dropColumn("keep_going");
      });
    },
  },
  {
    // Boss HP and damage moved from focus minutes to XP. Existing rows convert
    // at the XP rate of a minute, rounded to whole XP, so a boss mid-week keeps
    // its percent defeated.
    name: "006_boss_xp",
    async up(db) {
      await db.schema.alterTable("bosses", (t) => {
        t.renameColumn("max_hp_minutes", "max_hp_xp");
        t.renameColumn("damage_minutes", "damage_xp");
      });
      await db("bosses").update({
        max_hp_xp: db.raw("ROUND(max_hp_xp * ?)", [XP_PER_MINUTE_AT_006]),
        damage_xp: db.raw("ROUND(damage_xp * ?)", [XP_PER_MINUTE_AT_006]),
      });
    },
    async down(db) {
      await db("bosses").update({
        max_hp_xp: db.raw("max_hp_xp / ?", [XP_PER_MINUTE_AT_006]),
        damage_xp: db.raw("damage_xp / ?", [XP_PER_MINUTE_AT_006]),
      });
      await db.schema.alterTable("bosses", (t) => {
        t.renameColumn("max_hp_xp", "max_hp_minutes");
        t.renameColumn("damage_xp", "damage_minutes");
      });
    },
  },
  {
    // The boss now takes focus damage live, every minute. These remember how
    // much of the current focus block has already hit it.
    name: "007_live_boss_damage",
    async up(db) {
      for (const table of ["room_participants", "solo_sessions"]) {
        await db.schema.alterTable(table, (t) => {
          t.integer("boss_xp_dealt").notNullable().defaultTo(0);
        });
      }
    },
    async down(db) {
      for (const table of ["room_participants", "solo_sessions"]) {
        await db.schema.alterTable(table, (t) => {
          t.dropColumn("boss_xp_dealt");
        });
      }
    },
  },
  {
    // Focus minutes and XP are now credited every minute too, so a block
    // remembers what it has already credited and its end only adds the rest.
    name: "008_live_stats",
    async up(db) {
      for (const table of ["room_participants", "solo_sessions"]) {
        await db.schema.alterTable(table, (t) => {
          t.integer("live_minutes").notNullable().defaultTo(0);
          t.integer("live_xp").notNullable().defaultTo(0);
        });
      }
    },
    async down(db) {
      for (const table of ["room_participants", "solo_sessions"]) {
        await db.schema.alterTable(table, (t) => {
          t.dropColumn("live_xp");
          t.dropColumn("live_minutes");
        });
      }
    },
  },
];

class CodeMigrationSource implements Knex.MigrationSource<Migration> {
  async getMigrations() {
    return migrations;
  }
  getMigrationName(migration: Migration) {
    return migration.name;
  }
  async getMigration(migration: Migration) {
    return { up: (db: Knex) => migration.up(db), down: (db: Knex) => migration.down(db) };
  }
}

/** Knex migrator config. Exported so tests can step through migrations one at a time. */
export const migratorConfig: Knex.MigratorConfig = {
  migrationSource: new CodeMigrationSource(),
  tableName: "knex_migrations",
};

export async function migrateToLatest(db: Knex): Promise<void> {
  await db.migrate.latest(migratorConfig);
}

export async function rollbackAll(db: Knex): Promise<void> {
  await db.migrate.rollback(migratorConfig, true);
}
