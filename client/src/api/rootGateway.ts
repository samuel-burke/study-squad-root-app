import { ImageUriResolution, rootClient } from "@rootsdk/client-app";
import {
  leaderboardFromProto,
  leaderboardMetricToProto,
  leaderboardPeriodToProto,
  memberProfileFromProto,
  myStatusFromProto,
  personalResultFromProto,
  phaseCompletedFromProto,
  progressFromProto,
  roomFromProto,
  snapshotFromProto,
  voiceChannelChoiceFromProto,
} from "@studyroom/contract";
import {
  ClockSync,
  type LeaderboardMetric,
  type LeaderboardPeriod,
  type SnapshotDto,
} from "@studyroom/core";
import { studyRoomServiceClient, StudyRoomServiceClientEvent } from "@studyroom/gen-client";
import type { RoomSnapshot, SelfTest } from "@studyroom/gen-shared";
import {
  toGatewayError,
  type GatewayHandlers,
  type Profile,
  type SelfTestApi,
  type SelfTestReport,
  type SelfTestState,
  type StudyRoomGateway,
} from "./gateway";

const client = studyRoomServiceClient;

async function call<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw toGatewayError(error);
  }
}

function selfTestState(message: SelfTest): SelfTestState {
  let report: SelfTestReport | null;
  try {
    report = message.reportJson ? (JSON.parse(message.reportJson) as SelfTestReport) : null;
  } catch {
    report = null;
  }
  return {
    allowed: message.allowed,
    yourUserId: message.yourUserId,
    yourCommunityId: message.yourCommunityId,
    unconfigured: message.unconfigured,
    report,
  };
}

/** The self-test panel's half on the client: runs it, and answers the server's ping. */
class RootSelfTest implements SelfTestApi {
  private listening = false;

  async get() {
    return selfTestState(await call(() => client.getSelfTest({})));
  }

  async run(testPost: boolean) {
    if (!this.listening) {
      this.listening = true;
      client.on(StudyRoomServiceClientEvent.SelfTestPing, (event: { nonce: string }) => {
        void client.confirmSelfTestPing({ nonce: event.nonce }).catch(() => {});
      });
    }
    const info = await this.clientInfo();
    return selfTestState(
      await call(() => client.runSelfTest({ testPost, clientJson: JSON.stringify(info) })),
    );
  }

  async clientInfo() {
    const read = async (work: () => unknown) => {
      try {
        return await work();
      } catch (error) {
        return { threw: String(error) };
      }
    };
    const userId = rootClient.users.getCurrentUserId();
    const [theme, profiles] = await Promise.all([
      read(() => rootClient.theme.getTheme()),
      read(() => rootClient.users.getUserProfiles([userId])),
    ]);
    const profile = Array.isArray(profiles) ? profiles[0] : profiles;
    return {
      version: __BUILD_INFO__.version,
      genVersion: __BUILD_INFO__.genVersion,
      userId,
      theme,
      // Field names and types only: no nickname or picture in the report.
      profile:
        profile && typeof profile === "object"
          ? Object.fromEntries(
              Object.entries(profile as Record<string, unknown>).map(([k, v]) => [k, typeof v]),
            )
          : profile,
      userAgent: navigator.userAgent,
    };
  }
}

/** Talks to the Study Squad server through Root's generated client. */
export class RootGateway implements StudyRoomGateway {
  readonly kind = "root" as const;
  readonly selfTest: SelfTestApi = new RootSelfTest();
  private readonly clock = new ClockSync();

  currentUserId(): string {
    return rootClient.users.getCurrentUserId();
  }

  now(): number {
    return this.clock.now();
  }

  private async snapshot(request: () => Promise<RoomSnapshot>): Promise<SnapshotDto> {
    const sentAt = Date.now();
    const response = await call(request);
    const snapshot = snapshotFromProto(response);
    this.clock.sample(sentAt, Date.now(), snapshot.room.serverNow);
    return snapshot;
  }

  getSnapshot() {
    return this.snapshot(() => client.getRoom({}));
  }

  joinRoomTimer(request: { goals: string[]; goalsPrivate: boolean }) {
    return this.snapshot(() =>
      client.joinRoomTimer({ goals: request.goals, goalsPrivate: request.goalsPrivate }),
    );
  }

  leaveRoomTimer() {
    return this.snapshot(() => client.leaveRoomTimer({}));
  }

  startSolo(minutes: number, request: { goals: string[]; goalsPrivate: boolean }) {
    return this.snapshot(() =>
      client.startSolo({ minutes, goals: request.goals, goalsPrivate: request.goalsPrivate }),
    );
  }

  endSolo() {
    return this.snapshot(() => client.endSolo({}));
  }

  async addGoal(text: string) {
    return myStatusFromProto(await call(() => client.addGoal({ text })));
  }

  async setGoalDone(goalId: string, done: boolean) {
    return myStatusFromProto(await call(() => client.setGoalDone({ goalId, done })));
  }

  async deleteGoal(goalId: string) {
    return myStatusFromProto(await call(() => client.deleteGoal({ goalId })));
  }

  async editGoal(goalId: string, text: string) {
    return myStatusFromProto(await call(() => client.editGoal({ goalId, text })));
  }

  async clearDoneGoals() {
    return myStatusFromProto(await call(() => client.clearDoneGoals({})));
  }

  async reorderGoals(goalIds: string[]) {
    return myStatusFromProto(await call(() => client.reorderGoals({ goalIds })));
  }

  async setGoalsPrivate(goalsPrivate: boolean) {
    return myStatusFromProto(await call(() => client.setGoalsPrivate({ goalsPrivate })));
  }

  async deleteMyData() {
    return myStatusFromProto(await call(() => client.deleteMyData({})));
  }

  async sendFeedback(text: string) {
    await call(() => client.sendFeedback({ text }));
  }

  completeBreakChallenge() {
    return this.snapshot(() => client.completeBreakChallenge({}));
  }

  sendHighFive(userId: string, emoji: string) {
    return this.snapshot(() => client.sendHighFive({ toUserId: userId, emoji }));
  }

  async keepGoing() {
    return myStatusFromProto(await call(() => client.keepGoing({})));
  }

  async getProgress() {
    return progressFromProto(await call(() => client.getProgress({})));
  }

  async getLeaderboard(by: LeaderboardMetric = "minutes", period: LeaderboardPeriod = "week") {
    return leaderboardFromProto(
      await call(() =>
        client.getLeaderboard({
          by: leaderboardMetricToProto(by),
          period: leaderboardPeriodToProto(period),
        }),
      ),
    );
  }

  async setLeaderboardHidden(
    hidden: boolean,
    by: LeaderboardMetric = "minutes",
    period: LeaderboardPeriod = "week",
  ) {
    return leaderboardFromProto(
      await call(() =>
        client.setLeaderboardHidden({
          hidden,
          by: leaderboardMetricToProto(by),
          period: leaderboardPeriodToProto(period),
        }),
      ),
    );
  }

  async setCardStyle(style: string) {
    return progressFromProto(await call(() => client.setCardStyle({ style })));
  }

  async setBadgeShowcase(badgeIds: string[]) {
    return progressFromProto(await call(() => client.setBadgeShowcase({ badgeIds })));
  }

  async getMemberProfile(userId: string) {
    return memberProfileFromProto(await call(() => client.getMemberProfile({ userId })));
  }

  async getVoiceChannels() {
    return voiceChannelChoiceFromProto(await call(() => client.getVoiceChannels({})));
  }

  async setVoiceChannel(channelId: string) {
    return voiceChannelChoiceFromProto(await call(() => client.setVoiceChannel({ channelId })));
  }

  async getProfiles(userIds: string[]): Promise<Profile[]> {
    if (userIds.length === 0) return [];
    const profiles = await call(() => rootClient.users.getUserProfiles(userIds));
    return profiles.map((p) => ({
      userId: p.id,
      name: p.nickname,
      avatarUrl: p.profilePictureUri
        ? rootClient.assets.toImageUrl(p.profilePictureUri, ImageUriResolution.Small)
        : undefined,
    }));
  }

  subscribe(handlers: GatewayHandlers): () => void {
    const onRoom = (e: { room?: Parameters<typeof roomFromProto>[0] }) => {
      const room = roomFromProto(e.room);
      this.clock.observe(room.serverNow);
      handlers.roomUpdated(room);
    };
    const onPhase = (e: Parameters<typeof phaseCompletedFromProto>[0]) =>
      handlers.phaseCompleted(phaseCompletedFromProto(e));
    const onPersonal = (e: Parameters<typeof personalResultFromProto>[0]) =>
      handlers.personalResult(personalResultFromProto(e));
    const onStatus = (e: { me?: Parameters<typeof myStatusFromProto>[0] }) =>
      handlers.myStatus(myStatusFromProto(e.me));
    const onBadges = (e: { badgeIds: string[] }) => handlers.badgesEarned(e.badgeIds);
    const onHighFive = (e: { fromUserId: string; emoji: string }) =>
      handlers.highFive({ fromUserId: e.fromUserId, emoji: e.emoji });
    client.on(StudyRoomServiceClientEvent.RoomUpdated, onRoom);
    client.on(StudyRoomServiceClientEvent.PhaseCompleted, onPhase);
    client.on(StudyRoomServiceClientEvent.PersonalResult, onPersonal);
    client.on(StudyRoomServiceClientEvent.MyStatus, onStatus);
    client.on(StudyRoomServiceClientEvent.BadgesEarned, onBadges);
    client.on(StudyRoomServiceClientEvent.HighFive, onHighFive);
    return () => {
      client.off(StudyRoomServiceClientEvent.RoomUpdated, onRoom);
      client.off(StudyRoomServiceClientEvent.PhaseCompleted, onPhase);
      client.off(StudyRoomServiceClientEvent.PersonalResult, onPersonal);
      client.off(StudyRoomServiceClientEvent.MyStatus, onStatus);
      client.off(StudyRoomServiceClientEvent.BadgesEarned, onBadges);
      client.off(StudyRoomServiceClientEvent.HighFive, onHighFive);
    };
  }
}
