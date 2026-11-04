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

/**
 * Matches the admin's typed name loosely: case, spaces, dashes, emoji and a
 * leading # don't matter, so "study voice" finds "🔊 Study-Voice".
 */
export const channelKey = (name: string) =>
  name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

/** The channel whose name matches, or else the only one whose name contains it. */
function findByName(channels: ChannelInfo[], typed: string): ChannelInfo | undefined {
  const wanted = channelKey(typed);
  if (!wanted) return undefined;
  const exact = channels.find((c) => channelKey(c.name) === wanted);
  if (exact) return exact;
  const partial = channels.filter((c) => channelKey(c.name).includes(wanted));
  return partial.length === 1 ? partial[0] : undefined;
}

const listNames = (channels: ChannelInfo[]) =>
  channels
    .slice(0, 8)
    .map((c) => `#${c.name}`)
    .join(", ");

/** Finds the voice channel the admin typed, and says in words how that went. */
async function resolveVoice(
  config: AppConfig,
  lookup: ChannelLookup,
  logger: Logger,
): Promise<AppConfig> {
  const typed = config.voiceChannelName;
  let all: ChannelInfo[];
  try {
    all = await lookup.channels();
  } catch (error) {
    logger.warn("could not read voice channel", { error: String(error) });
    return {
      ...config,
      voiceChannelStatus: `Couldn't read the channel list, so "${typed}" wasn't found`,
    };
  }
  const voices = all.filter((c) => c.voice);
  // Prefer voice channels. If Root reports none at all, fall back to any
  // channel with that name rather than giving up on a type mismatch.
  const found =
    findByName(voices, typed) ?? (voices.length === 0 ? findByName(all, typed) : undefined);
  if (!found) {
    const textMatch = findByName(all, typed);
    logger.warn("no voice channel has that name", {
      name: typed,
      voiceChannels: voices.map((c) => c.name),
      channelCount: all.length,
    });
    const status = textMatch
      ? `#${textMatch.name} isn't a voice channel`
      : voices.length > 0
        ? `No voice channel called "${typed}". Voice channels it can see: ${listNames(voices)}`
        : `No voice channel called "${typed}". Study Squad can't see any voice channels, so give it access to one`;
    return { ...config, voiceChannelStatus: status };
  }

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

/** Reads Root's settings and resolves the post and voice channels' names and link. */
export async function loadConfig(
  settings: unknown,
  channels: ChannelLookup,
  logger: Logger,
): Promise<AppConfig> {
  let config = parseSettings(settings as RawSettings);
  if (config.postChannelId) {
    try {
      config = { ...config, postChannelName: await channels.name(config.postChannelId) };
    } catch (error) {
      logger.warn("could not read post channel", { error: String(error) });
    }
  }
  if (config.voiceChannelName) config = await resolveVoice(config, channels, logger);
  return config;
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
