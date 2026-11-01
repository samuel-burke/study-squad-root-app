import {
  parseSettings,
  type AppConfig,
  type Logger,
  type RawSettings,
  type StudyRoomEngine,
} from "@studyroom/core";

const describeError = (error: unknown) =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);

/** What loadConfig needs from Root to describe the picked channels. */
export interface ChannelLookup {
  name(channelId: string): Promise<string>;
  /** A link that opens the channel in Root. */
  link(channelId: string): Promise<string>;
  /** The community's voice channels. */
  voiceChannels(): Promise<{ id: string; name: string }[]>;
}

/** Matches the admin's typed name loosely: case, spaces and a leading # don't matter. */
const channelKey = (name: string) =>
  name.replace(/^#/, "").replace(/\s+/g, " ").trim().toLowerCase();

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
  if (config.voiceChannelName) {
    try {
      const wanted = channelKey(config.voiceChannelName);
      const voice = (await channels.voiceChannels()).find((c) => channelKey(c.name) === wanted);
      if (voice) {
        const url = await channels.link(voice.id);
        config = {
          ...config,
          voiceChannelId: voice.id,
          voiceChannelName: voice.name,
          voiceChannelUrl: url,
        };
      } else {
        logger.warn("no voice channel has that name", { name: config.voiceChannelName });
      }
    } catch (error) {
      logger.warn("could not read voice channel", { error: String(error) });
    }
  }
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
