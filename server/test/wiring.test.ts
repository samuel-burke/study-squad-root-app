import { describe, expect, it, vi } from "vitest";
import { PushNotifier } from "../src/adapters/pushNotifier";
import { createShutdown, findAttachedClient, loadConfig, presenceHandlers } from "../src/wiring";

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe("loadConfig", () => {
  const lookup = (name = async (_id: string) => "study-hall") => ({
    name: vi.fn(name),
    link: vi.fn(async (id: string) => `https://rootapp.com/${id}`),
    voiceChannels: vi.fn(async () => [
      { id: "voice-1", name: "Study Voice" },
      { id: "voice-2", name: "Gaming" },
    ]),
  });

  it("adds the post channel's name", async () => {
    const channels = lookup();
    const config = await loadConfig({ room: { postChannel: "channel-1" } }, channels, logger());
    expect(channels.name).toHaveBeenCalledWith("channel-1");
    expect(config).toMatchObject({ postChannelId: "channel-1", postChannelName: "study-hall" });
  });

  it("finds the voice channel by the name the admin typed, loosely", async () => {
    const config = await loadConfig(
      { room: { voiceChannelName: " #study  voice " } },
      lookup(),
      logger(),
    );
    expect(config).toMatchObject({
      voiceChannelId: "voice-1",
      voiceChannelName: "Study Voice",
      voiceChannelUrl: "https://rootapp.com/voice-1",
    });
  });

  it("hides the button and logs when no voice channel has that name", async () => {
    const log = logger();
    const config = await loadConfig({ room: { voiceChannelName: "study-hall" } }, lookup(), log);
    expect(config.voiceChannelId).toBeNull();
    expect(log.warn).toHaveBeenCalledWith("no voice channel has that name", {
      name: "study-hall",
    });
  });

  it("skips the lookups when no channel is set", async () => {
    const channels = lookup();
    const config = await loadConfig(undefined, channels, logger());
    expect(channels.name).not.toHaveBeenCalled();
    expect(channels.voiceChannels).not.toHaveBeenCalled();
    expect(config.postChannelId).toBeNull();
    expect(config.voiceChannelId).toBeNull();
  });

  it("keeps the settings and logs when a channel can't be read", async () => {
    const log = logger();
    const failing = async () => {
      throw new Error("403");
    };
    const config = await loadConfig(
      { room: { postChannel: "channel-1", voiceChannelName: "Study voice" } },
      { name: failing, link: failing, voiceChannels: failing },
      log,
    );
    expect(config).toMatchObject({ postChannelId: "channel-1", voiceChannelId: null });
    expect(log.warn).toHaveBeenCalledWith("could not read post channel", { error: "Error: 403" });
    expect(log.warn).toHaveBeenCalledWith("could not read voice channel", { error: "Error: 403" });
  });
});

describe("presenceHandlers", () => {
  it("passes attach and detach through to the engine", async () => {
    const engine = { userAttached: vi.fn(async () => {}), userDetached: vi.fn(async () => {}) };
    const presence = presenceHandlers(engine, logger());
    await presence.attached("ana");
    await presence.detached("ana");
    expect(engine.userAttached).toHaveBeenCalledWith("ana");
    expect(engine.userDetached).toHaveBeenCalledWith("ana");
  });

  it("logs a failed update instead of rejecting", async () => {
    const log = logger();
    const engine = {
      userAttached: vi.fn(() => Promise.reject(new Error("database is locked"))),
      userDetached: vi.fn(() => Promise.reject("gone")),
    };
    const presence = presenceHandlers(engine, log);
    await expect(presence.attached("ana")).resolves.toBeUndefined();
    await expect(presence.detached("ana")).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith(
      "presence update failed",
      expect.objectContaining({ operation: "userAttached" }),
    );
    expect(log.error).toHaveBeenCalledWith("presence update failed", {
      operation: "userDetached",
      error: "gone",
    });
  });
});

describe("createShutdown", () => {
  it("stops the engine, drains it, then closes the database", async () => {
    const order: string[] = [];
    const engine = {
      stop: vi.fn(() => order.push("stop")),
      idle: vi.fn(async () => void order.push("idle")),
    };
    await createShutdown(engine, async () => void order.push("close"), logger())();
    expect(order).toEqual(["stop", "idle", "close"]);
  });

  it("closes the database even when draining fails", async () => {
    const log = logger();
    const close = vi.fn(async () => {});
    const engine = { stop: vi.fn(), idle: vi.fn(() => Promise.reject(new Error("stuck"))) };
    await createShutdown(engine, close, log)();
    expect(close).toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith("shutdown drain failed", expect.anything());
  });
});

describe("findAttachedClient", () => {
  const ana = { userId: "ana", communityId: "c1", deviceIds: ["d1"] };
  const kai = { userId: "kai", communityId: "c1", deviceIds: ["d2"] };

  it("finds a member's client by user id", () => {
    expect(findAttachedClient(() => [ana, kai], "kai")).toBe(kai);
    expect(findAttachedClient(() => [ana], "kai")).toBeUndefined();
  });

  it("lets a background push (a timer finishing) reach the member", () => {
    const broadcaster = {
      broadcastRoomUpdated: vi.fn(),
      broadcastPhaseCompleted: vi.fn(),
      broadcastPersonalResult: vi.fn(),
      broadcastMyStatus: vi.fn(),
      broadcastBadgesEarned: vi.fn(),
    };
    const notifier = new PushNotifier(broadcaster, (userId) =>
      findAttachedClient(() => [ana, kai], userId),
    );
    notifier.badgesEarned("ana", ["first-session"]);
    expect(broadcaster.broadcastBadgesEarned).toHaveBeenCalledWith(
      { badgeIds: ["first-session"] },
      [ana],
    );
  });
});
