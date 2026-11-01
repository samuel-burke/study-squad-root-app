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
} from "@studyroom/contract";
import {
  ClockSync,
  type LeaderboardMetric,
  type LeaderboardPeriod,
  type SnapshotDto,
} from "@studyroom/core";
import { studyRoomServiceClient, StudyRoomServiceClientEvent } from "@studyroom/gen-client";
import type { RoomSnapshot } from "@studyroom/gen-shared";
import {
  toGatewayError,
  type GatewayHandlers,
  type Profile,
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

/** Talks to the Study Squad server through Root's generated client. */
export class RootGateway implements StudyRoomGateway {
  readonly kind = "root" as const;
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

  async setGoalsPrivate(goalsPrivate: boolean) {
    return myStatusFromProto(await call(() => client.setGoalsPrivate({ goalsPrivate })));
  }

  async deleteMyData() {
    return myStatusFromProto(await call(() => client.deleteMyData({})));
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
    client.on(StudyRoomServiceClientEvent.RoomUpdated, onRoom);
    client.on(StudyRoomServiceClientEvent.PhaseCompleted, onPhase);
    client.on(StudyRoomServiceClientEvent.PersonalResult, onPersonal);
    client.on(StudyRoomServiceClientEvent.MyStatus, onStatus);
    client.on(StudyRoomServiceClientEvent.BadgesEarned, onBadges);
    return () => {
      client.off(StudyRoomServiceClientEvent.RoomUpdated, onRoom);
      client.off(StudyRoomServiceClientEvent.PhaseCompleted, onPhase);
      client.off(StudyRoomServiceClientEvent.PersonalResult, onPersonal);
      client.off(StudyRoomServiceClientEvent.MyStatus, onStatus);
      client.off(StudyRoomServiceClientEvent.BadgesEarned, onBadges);
    };
  }
}
