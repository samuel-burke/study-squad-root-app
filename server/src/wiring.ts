import {
  parseSettings,
  type AppConfig,
  type Logger,
  type RawSettings,
  type StudyRoomEngine,
} from "@studyroom/core";

const describeError = (error: unknown) =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);

/** What loadConfig needs from Root to name the post channel. */
export interface ChannelLookup {
  name(channelId: string): Promise<string>;
}

/** Reads Root's settings and resolves the post channel's name. */
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
