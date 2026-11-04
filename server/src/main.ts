import { randomUUID } from "node:crypto";
import {
  ClientEvent,
  GlobalSettingsEvent,
  JobInterval,
  JobScheduleEvent,
  rootServer,
  type ChannelGuid,
  type GlobalSettings,
  type JobData,
  type RootAppStartState,
  type UserGuid,
} from "@rootsdk/server-app";
import { StudyRoomEngine, type AppConfig } from "@studyroom/core";
import { ChannelAnnouncer } from "./adapters/channelAnnouncer";
import { loadFeedbackDestination, RelayFeedbackInbox } from "./adapters/feedbackInbox";
import { createLogger } from "./adapters/logger";
import { PushNotifier } from "./adapters/pushNotifier";
import { TimeoutScheduler } from "./adapters/timeoutScheduler";
import { StudyRoomHandlers } from "./handlers";
import { RecapScheduler } from "./jobs/recapScheduler";
import { openDatabase } from "./persistence/database";
import { KnexStore } from "./persistence/knexStore";
import { migrateToLatest } from "./persistence/migrations";
import { studyRoomService } from "./studyRoomService";
import { createShutdown, findAttachedClient, loadConfig, presenceHandlers } from "./wiring";

const logger = createLogger();
let shutdown: (() => Promise<void>) | null = null;

function loadRootConfig(settings: GlobalSettings | undefined): Promise<AppConfig> {
  return loadConfig(
    settings,
    {
      name: async (id) => (await rootServer.community.channels.get({ id: id as ChannelGuid })).name,
    },
    logger,
  );
}

async function onStarting(state: RootAppStartState): Promise<void> {
  const filename = rootServer.dataStore.config.sqlite3?.filename;
  if (!filename) throw new Error("Root did not provide a SQLite database for this app.");
  const db = openDatabase(filename);
  await migrateToLatest(db);

  const feedback = loadFeedbackDestination(process.env, __dirname);
  logger.info(feedback ? "feedback goes to the relay" : "feedback not configured, box hidden");

  const engine = new StudyRoomEngine({
    store: new KnexStore(db),
    clock: { now: Date.now },
    scheduler: new TimeoutScheduler(),
    notifier: new PushNotifier(studyRoomService, (userId) =>
      findAttachedClient(() => rootServer.clients.getClients(), userId),
    ),
    announcer: new ChannelAnnouncer({
      postMessage: async (channelId, content) => {
        await rootServer.community.channelMessages.create({
          channelId: channelId as ChannelGuid,
          content,
        });
      },
      nickname: async (userId) =>
        (await rootServer.community.communityMembers.get({ userId: userId as UserGuid })).nickname,
    }),
    feedbackInbox: feedback ? new RelayFeedbackInbox(feedback) : undefined,
    logger,
    config: await loadRootConfig(state.globalSettings ?? rootServer.globalSettings),
    newId: randomUUID,
    random: Math.random,
  });
  studyRoomService.bind(new StudyRoomHandlers(engine, logger));
  rootServer.lifecycle.addService(studyRoomService);
  await engine.start();

  // Presence: who has Study Squad open right now.
  await engine.setPresence(rootServer.clients.getClients().map((c) => c.userId));
  const presence = presenceHandlers(engine, logger);
  rootServer.clients.on(
    ClientEvent.UserAttached,
    (client) => void presence.attached(client.userId),
  );
  rootServer.clients.on(
    ClientEvent.UserDetached,
    (client) => void presence.detached(client.userId),
  );

  const recap = new RecapScheduler(
    {
      scheduleOnce: async (tag, at) => {
        await rootServer.jobScheduler.create({
          resourceId: tag,
          tag,
          start: at,
          jobInterval: JobInterval.OneTime,
        });
      },
      cancelByTag: (tag) => rootServer.jobScheduler.deleteByTag(tag),
      onJob: (handler) => {
        const relay = (missed: boolean) => (job: JobData) =>
          handler({ tag: job.tag, jobTime: job.jobTime, missed });
        rootServer.jobScheduler.on(JobScheduleEvent.Job, relay(false));
        rootServer.jobScheduler.on(JobScheduleEvent.JobMissed, relay(true));
      },
    },
    engine,
    logger,
  );
  await recap.start();

  // Admins edit settings in Root's App settings; apply them live.
  rootServer.globalSettings?.on(GlobalSettingsEvent.Update, (event) => {
    void (async () => {
      const config = await loadRootConfig(event.current);
      await engine.setConfig(config);
      await recap.reschedule();
      logger.info("settings updated");
    })().catch((error: unknown) =>
      logger.error("settings update failed", { error: String(error) }),
    );
  });

  shutdown = createShutdown(engine, () => db.destroy(), logger);
  logger.info("study squad started");
}

async function onStopping(): Promise<void> {
  await shutdown?.();
  logger.info("study squad stopped");
}

(async () => {
  await rootServer.lifecycle.start(onStarting, onStopping);
})().catch((error: unknown) => {
  logger.error("failed to start", {
    error: error instanceof Error ? (error.stack ?? error.message) : String(error),
  });
  process.exitCode = 1;
});
