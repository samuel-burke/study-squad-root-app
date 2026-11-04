import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSettings, PRESETS, SETTINGS } from "../src";

const room = SETTINGS.room;
const game = SETTINGS.game;

describe("parseSettings", () => {
  it("ignores the removed settings an admin may still have saved", () => {
    const config = parseSettings({
      [room.group]: {
        squadPersonalities: ["drill"],
        voiceChannelName: "Study voice",
      },
      [game.group]: { dailyXpCap: { value: 100 }, bossName: "Calc II" },
    });
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("leaves bot @mentions off unless an admin turns them on", () => {
    expect(DEFAULT_CONFIG.squadBot.mentions).toBe(false);
    const on = parseSettings({ [room.group]: { [room.squadMentions]: true } });
    expect(on.squadBot.mentions).toBe(true);
  });

  it("falls back to defaults when Root sends nothing", () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_CONFIG);
    expect(parseSettings({})).toEqual(DEFAULT_CONFIG);
  });

  it("reads select, channel, time and checkbox values in Root's shapes", () => {
    const config = parseSettings({
      [room.group]: {
        [room.preset]: ["50-10"],
        [room.postChannel]: ["channel-9"],
        [room.recapTime]: { hours: 20, minutes: 30, seconds: 0 },
        [room.timeZone]: ["Europe/Berlin"],
        [room.busyPosts]: false,
      },
      [game.group]: {
        [game.bossBaseHp]: 4000,
        [game.comboEnabled]: false,
      },
    });
    expect(config.preset).toEqual(PRESETS["50-10"]);
    expect(config.postChannelId).toBe("channel-9");
    expect(config.recap).toEqual({ enabled: true, hours: 20, minutes: 30 });
    expect(config.timeZone).toBe("Europe/Berlin");
    expect(config.busyPosts.enabled).toBe(false);
    expect(config.boss).toEqual({ enabled: true, baseHpXp: 4000 });
    expect(config.comboEnabled).toBe(false);
  });

  it("builds a custom preset and clamps it to sane ranges", () => {
    const config = parseSettings({
      [room.group]: { [room.preset]: ["custom"], [room.customFocus]: 500, [room.customBreak]: 0 },
    });
    expect(config.presetKey).toBe("custom");
    expect(config.preset.focusMinutes).toBe(120);
    expect(config.preset.breakMinutes).toBe(1);
  });

  it("still reads values saved by the older select versions of these settings", () => {
    const config = parseSettings({
      [room.group]: { [room.busyThreshold]: ["8"] },
      [game.group]: { [game.bossBaseHp]: ["2500"] },
    });
    expect(config.busyPosts.threshold).toBe(8);
    expect(config.boss.baseHpXp).toBe(2500);
  });

  it("reads the number fields Root sends, rounded to whole numbers and clamped", () => {
    const config = parseSettings({
      [room.group]: {
        [room.preset]: ["custom"],
        [room.customFocus]: 37,
        [room.customBreak]: 7.6,
        [room.busyThreshold]: 1,
      },
      [game.group]: { [game.bossBaseHp]: 5_000_000 },
    });
    expect(config.preset.focusMinutes).toBe(37);
    expect(config.preset.breakMinutes).toBe(8);
    expect(config.busyPosts.threshold).toBe(2);
    expect(config.boss.baseHpXp).toBe(1_000_000);
  });

  it("unwraps the { value } object the Root SDK actually sends for number fields", () => {
    const config = parseSettings({
      [room.group]: {
        [room.preset]: ["custom"],
        [room.customFocus]: { value: 45 },
        [room.customBreak]: { value: 10 },
        [room.busyThreshold]: { value: 7 },
      },
      [game.group]: { [game.bossBaseHp]: { value: 3200 } },
    });
    expect(config.preset.focusMinutes).toBe(45);
    expect(config.preset.breakMinutes).toBe(10);
    expect(config.busyPosts.threshold).toBe(7);
    expect(config.boss.baseHpXp).toBe(3200);
  });

  it("falls back to defaults when a number field is left empty", () => {
    const config = parseSettings({
      [room.group]: { [room.preset]: ["custom"], [room.customFocus]: undefined },
      [game.group]: { [game.bossBaseHp]: undefined },
    });
    expect(config.preset.focusMinutes).toBe(25);
    expect(config.boss.baseHpXp).toBe(DEFAULT_CONFIG.boss.baseHpXp);
  });

  it("rejects bad values instead of trusting them", () => {
    const config = parseSettings({
      [room.group]: {
        [room.preset]: ["9000-1"],
        [room.timeZone]: ["Mars/Olympus"],
        [room.postChannel]: [],
        [room.recapTime]: "21:00",
        [room.busyThreshold]: Number.NaN,
      },
      [game.group]: {
        [game.xpEnabled]: "yes",
        [game.bossBaseHp]: ["lots"],
      },
    });
    expect(config.preset).toEqual(DEFAULT_CONFIG.preset);
    expect(config.timeZone).toBe(DEFAULT_CONFIG.timeZone);
    expect(config.postChannelId).toBeNull();
    expect(config.recap).toEqual(DEFAULT_CONFIG.recap);
    expect(config.busyPosts.threshold).toBe(5);
    expect(config.xp).toEqual({ enabled: true });
  });
});
