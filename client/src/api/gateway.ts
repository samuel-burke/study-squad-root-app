import type {
  LeaderboardDto,
  LeaderboardMetric,
  LeaderboardPeriod,
  MemberProfileDto,
  MyStatusDto,
  PersonalResultDto,
  PhaseCompletedDto,
  ProgressDto,
  RoomStateDto,
  SnapshotDto,
} from "@studyroom/core";

export interface Profile {
  userId: string;
  name: string;
  avatarUrl?: string;
}

export interface StartRequest {
  goals: string[];
  goalsPrivate: boolean;
}

export interface GatewayHandlers {
  roomUpdated(room: RoomStateDto): void;
  phaseCompleted(event: PhaseCompletedDto): void;
  personalResult(event: PersonalResultDto): void;
  myStatus(me: MyStatusDto): void;
  /** Badges the current member just earned. */
  badgesEarned(badgeIds: string[]): void;
}

/** An error the UI can show as-is. */
export class GatewayError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

/**
 * Everything the UI needs from the outside world. The Root implementation
 * talks to the server; the demo implementation runs the engine locally.
 */
export interface StudyRoomGateway {
  readonly kind: "root" | "demo";
  currentUserId(): string;
  /** Server time, corrected for this device's clock offset. */
  now(): number;
  getSnapshot(): Promise<SnapshotDto>;
  joinRoomTimer(request: StartRequest): Promise<SnapshotDto>;
  leaveRoomTimer(): Promise<SnapshotDto>;
  startSolo(minutes: number, request: StartRequest): Promise<SnapshotDto>;
  endSolo(): Promise<SnapshotDto>;
  addGoal(text: string): Promise<MyStatusDto>;
  setGoalDone(goalId: string, done: boolean): Promise<MyStatusDto>;
  deleteGoal(goalId: string): Promise<MyStatusDto>;
  setGoalsPrivate(goalsPrivate: boolean): Promise<MyStatusDto>;
  getProgress(): Promise<ProgressDto>;
  /** This week by focus minutes unless `by` and `period` say otherwise. */
  getLeaderboard(by?: LeaderboardMetric, period?: LeaderboardPeriod): Promise<LeaderboardDto>;
  setLeaderboardHidden(
    hidden: boolean,
    by?: LeaderboardMetric,
    period?: LeaderboardPeriod,
  ): Promise<LeaderboardDto>;
  /** "" goes back to the automatic style. */
  setCardStyle(style: string): Promise<ProgressDto>;
  /** Up to three earned badges for the card; empty shows the most recent. */
  setBadgeShowcase(badgeIds: string[]): Promise<ProgressDto>;
  /** Erases everything stored about the current member. */
  deleteMyData(): Promise<MyStatusDto>;
  /** Answers "Keep going?" so the member rolls into the next cycle. */
  keepGoing(): Promise<MyStatusDto>;
  /** Another member's public game stats, for their profile card. */
  getMemberProfile(userId: string): Promise<MemberProfileDto>;
  getProfiles(userIds: string[]): Promise<Profile[]>;
  subscribe(handlers: GatewayHandlers): () => void;
}

export function toGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) return error;
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    const { code, message } = error as { code: unknown; message: unknown };
    if (typeof code === "number" && typeof message === "string" && message.length > 0 && code > 0) {
      return new GatewayError(code, message);
    }
  }
  return new GatewayError(0, "Couldn't reach Study Squad. Check your connection and try again.");
}
