import {
  parseSettings,
  type AppConfig,
  type Logger,
  type RawSettings,
  type StudyRoomEngine,
} from "@studyroom/core";

const describeError = (error: unknown) =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);

/** A community channel as loadConfig sees it. */
export interface ChannelInfo {
  id: string;
  name: string;
  /** A voice channel (people can join it to talk). */
  voice: boolean;
}

/** What loadConfig needs from Root to describe the picked channels. */
export interface ChannelLookup {
  name(channelId: string): Promise<string>;
  /** A link that opens the channel in Root. */
  link(channelId: string): Promise<string>;
  /** Every channel Study Squad can see, voice or not. */
  channels(): Promise<ChannelInfo[]>;
}

/** Reads every channel, or says in words why it couldn't. */
async function readChannels(lookup: ChannelLookup, logger: Logger): Promise<ChannelInfo[] | null> {
  try {
    return await lookup.channels();
  } catch (error) {
    logger.warn("could not read voice channel", { error: String(error) });
    return null;
  }
}

/** Fills in the found voice channel and its Join voice link. */
async function useVoiceChannel(
  config: AppConfig,
  found: ChannelInfo,
  lookup: ChannelLookup,
  logger: Logger,
): Promise<AppConfig> {
  const resolved = {
    ...config,
    voiceChannelId: found.id,
    voiceChannelName: found.name,
    voiceChannelStatus: `#${found.name}`,
  };
  try {
    return { ...resolved, voiceChannelUrl: await lookup.link(found.id) };
  } catch (error) {
    // Still mark who is in voice, even without a button to join.
    logger.warn("could not make voice channel link", { error: String(error) });
    return {
      ...resolved,
      voiceChannelStatus: `#${found.name}, but Root wouldn't make a Join voice link`,
    };
  }
}

/**
 * Reads Root's settings and resolves the post channel's name and the voice
 * channel an admin picked in the app's own Room settings (`pickedVoiceId`).
 * Root's channel picker setting only lists text channels, so the voice
 * channel isn't a Root setting at all.
 */
export async function loadConfig(
  settings: unknown,
  channels: ChannelLookup,
  logger: Logger,
  pickedVoiceId = "",
): Promise<AppConfig> {
  let config = parseSettings(settings as RawSettings);
  if (config.postChannelId) {
    try {
      config = { ...config, postChannelName: await channels.name(config.postChannelId) };
    } catch (error) {
      logger.warn("could not read post channel", { error: String(error) });
    }
  }
  if (!pickedVoiceId) return config;

  const all = await readChannels(channels, logger);
  if (!all) {
    return {
      ...config,
      voiceChannelStatus:
        "Couldn't read the channel list, so the picked voice channel wasn't found",
    };
  }
  const picked = all.find((c) => c.voice && c.id === pickedVoiceId);
  if (picked) return useVoiceChannel(config, picked, channels, logger);
  logger.warn("picked voice channel is gone", { channelId: pickedVoiceId });
  return {
    ...config,
    voiceChannelStatus:
      "The picked voice channel is gone or Study Squad can't see it. Pick another one",
  };
}

/** A role's community-wide permissions, as far as app admin goes. */
export interface RolePermissions {
  id: string;
  communityPermission: {
    communityManageApps: boolean;
    communityFullControl: boolean;
    communityManageCommunity: boolean;
  };
}

export interface AdminLookup {
  ownerUserId(): Promise<string>;
  /** The member's roles, not counting the everyone role. */
  memberRoleIds(userId: string): Promise<string[]>;
  roles(): Promise<RolePermissions[]>;
  everyoneRoleId: string;
}

/**
 * Whether a member counts as an admin for in-app settings: the community
 * owner, or anyone with a role (the everyone role included) that can manage
 * apps, manage the community, or has full control. Root itself gates its
 * App settings on managing apps, so this matches who can edit those.
 */
export async function canManageApps(userId: string, lookup: AdminLookup): Promise<boolean> {
  if ((await lookup.ownerUserId()) === userId) return true;
  const mine = new Set([...(await lookup.memberRoleIds(userId)), lookup.everyoneRoleId]);
  return (await lookup.roles()).some(
    (role) =>
      mine.has(role.id) &&
      (role.communityPermission.communityManageApps ||
        role.communityPermission.communityFullControl ||
        role.communityPermission.communityManageCommunity),
  );
}

type PresenceEngine = Pick<StudyRoomEngine, "userAttached" | "userDetached">;

/**
 * Event handlers for Root's attach/detach events. They run outside any
 * request, so a failure here (say, a locked database) is logged rather than
 * left as an unhandled rejection, which would crash the server.
 */
export function presenceHandlers(engine: PresenceEngine, logger: Logger) {
  const guard = (operation: string, work: Promise<void>) =>
    work.catch((error: unknown) =>
      logger.error("presence update failed", { operation, error: describeError(error) }),
    );
  return {
    attached: (userId: string) => guard("userAttached", engine.userAttached(userId)),
    detached: (userId: string) => guard("userDetached", engine.userDetached(userId)),
  };
}

/**
 * Finds a member's attached Root client, for personal pushes. Root's own
 * `clients.getClient(userId)` keys its lookup on the configured community id
 * in a different format from the one clients are stored under, so it never
 * finds anyone and every personal push (break results, status, badges) was
 * silently dropped. Searching the attached clients by user id always works.
 */
export function findAttachedClient<C extends { userId: string }>(
  clients: () => readonly C[],
  userId: string,
): C | undefined {
  return clients().find((client) => client.userId === userId);
}

/** Stops the engine and always closes the database, even if draining fails. */
export function createShutdown(
  engine: Pick<StudyRoomEngine, "stop" | "idle">,
  closeDatabase: () => Promise<void>,
  logger: Logger,
): () => Promise<void> {
  return async () => {
    try {
      engine.stop();
      await engine.idle();
    } catch (error) {
      logger.error("shutdown drain failed", { error: describeError(error) });
    } finally {
      await closeDatabase();
    }
  };
}
