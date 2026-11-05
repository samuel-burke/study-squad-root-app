import { describe, expect, it, vi } from "vitest";
import { PushNotifier } from "../src/adapters/pushNotifier";
import {
  canManageApps,
  createShutdown,
  findAttachedClient,
  loadConfig,
  presenceHandlers,
} from "../src/wiring";

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe("loadConfig", () => {
  const lookup = () => ({
    name: vi.fn(async () => "study-hall"),
    link: vi.fn(async (id: string) => `https://rootapp.com/${id}`),
    channels: vi.fn(async () => [
      { id: "text-1", name: "study-hall", voice: false },
      { id: "voice-1", name: "Study voice", voice: true },
      { id: "voice-2", name: "Gaming", voice: true },
    ]),
  });

  it("adds the post channel's name", async () => {
    const channels = lookup();
    const config = await loadConfig({ room: { postChannel: "channel-1" } }, channels, logger());
    expect(channels.name).toHaveBeenCalledWith("channel-1");
    expect(config).toMatchObject({ postChannelId: "channel-1", postChannelName: "study-hall" });
  });

  it("uses the voice channel picked in the app", async () => {
    const config = await loadConfig(undefined, lookup(), logger(), "voice-2");
    expect(config).toMatchObject({
      voiceChannelId: "voice-2",
      voiceChannelName: "Gaming",
      voiceChannelUrl: "https://rootapp.com/voice-2",
      voiceChannelStatus: "#Gaming",
    });
  });

  it("ignores the old typed voice channel name setting", async () => {
    const channels = lookup();
    const config = await loadConfig(
      { room: { voiceChannelName: "study voice" } },
      channels,
      logger(),
    );
    expect(channels.channels).not.toHaveBeenCalled();
    expect(config).toMatchObject({ voiceChannelId: null, voiceChannelName: "" });
  });

  it("never uses a text channel even if its id was saved", async () => {
    const config = await loadConfig(undefined, lookup(), logger(), "text-1");
    expect(config.voiceChannelId).toBeNull();
    expect(config.voiceChannelStatus).toMatch(/picked voice channel is gone/);
  });

  it("says so when the picked channel is gone", async () => {
    const log = logger();
    const config = await loadConfig(undefined, lookup(), log, "deleted");
    expect(config.voiceChannelId).toBeNull();
    expect(config.voiceChannelStatus).toMatch(/Pick another one/);
    expect(log.warn).toHaveBeenCalledWith("picked voice channel is gone", { channelId: "deleted" });
  });

  it("keeps the channel for headphones when the join link can't be made", async () => {
    const channels = {
      ...lookup(),
      link: vi.fn(async () => {
        throw new Error("403");
      }),
    };
    const config = await loadConfig(undefined, channels, logger(), "voice-2");
    expect(config).toMatchObject({
      voiceChannelId: "voice-2",
      voiceChannelUrl: "",
      voiceChannelStatus: "#Gaming, but Root wouldn't make a Join voice link",
    });
  });

  it("skips the lookups when no channel is set", async () => {
    const channels = lookup();
    const config = await loadConfig(undefined, channels, logger());
    expect(channels.name).not.toHaveBeenCalled();
    expect(channels.channels).not.toHaveBeenCalled();
    expect(config.postChannelId).toBeNull();
    expect(config.voiceChannelId).toBeNull();
    expect(config.voiceChannelStatus).toBe("");
  });

  it("keeps the settings and logs when a channel can't be read", async () => {
    const log = logger();
    const failing = async () => {
      throw new Error("403");
    };
    const config = await loadConfig(
      { room: { postChannel: "channel-1" } },
      { name: failing, link: failing, channels: failing },
      log,
      "voice-1",
    );
    expect(config).toMatchObject({ postChannelId: "channel-1", voiceChannelId: null });
    expect(config.voiceChannelStatus).toMatch(/Couldn't read the channel list/);
    expect(log.warn).toHaveBeenCalledWith("could not read post channel", { error: "Error: 403" });
    expect(log.warn).toHaveBeenCalledWith("could not read voice channel", { error: "Error: 403" });
  });
});

describe("canManageApps", () => {
  const perms = (p: Partial<Record<string, boolean>> = {}) => ({
    communityManageApps: false,
    communityFullControl: false,
    communityManageCommunity: false,
    ...p,
  });
  const lookup = (memberRoles: string[], everyone = perms()) => ({
    ownerUserId: vi.fn(async () => "owner"),
    memberRoleIds: vi.fn(async () => memberRoles),
    roles: vi.fn(async () => [
      { id: "everyone", communityPermission: everyone },
      { id: "mods", communityPermission: perms({ communityManageApps: true }) },
      { id: "admins", communityPermission: perms({ communityFullControl: true }) },
      { id: "members", communityPermission: perms() },
    ]),
    everyoneRoleId: "everyone",
  });

  it("lets the owner in without reading roles", async () => {
    const l = lookup([]);
    expect(await canManageApps("owner", l)).toBe(true);
    expect(l.roles).not.toHaveBeenCalled();
  });

  it.each([
    [["mods"], true],
    [["admins"], true],
    [["members"], false],
    [[], false],
  ])("member with roles %j can manage: %s", async (roles, expected) => {
    expect(await canManageApps("ana", lookup(roles))).toBe(expected);
  });

  it("counts the everyone role", async () => {
    expect(await canManageApps("ana", lookup([], perms({ communityManageCommunity: true })))).toBe(
      true,
    );
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
