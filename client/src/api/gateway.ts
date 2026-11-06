import type {
  HighFiveDto,
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
  VoiceChannelChoiceDto,
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
  /** Someone high-fived the current member. */
  highFive(event: HighFiveDto): void;
}

/** One live check from the self-test panel (server/src/selfTest.ts). */
export interface SelfTestCheck {
  id: string;
  title: string;
  status: "pass" | "warn" | "fail" | "pending";
  detail: string;
  raw?: unknown;
}

export interface SelfTestReport {
  app: { version: string; genVersion: string };
  startedAt: string;
  done: boolean;
  checks: SelfTestCheck[];
  /** Added by the client when the report is copied. */
  client?: unknown;
}

export interface SelfTestState {
  /** The current member may run it here (their user id and this community are on the build's lists). */
  allowed: boolean;
  report: SelfTestReport | null;
}

/** The owner-only self-test panel. Only the Root gateway has one. */
export interface SelfTestApi {
  get(): Promise<SelfTestState>;
  run(testPost: boolean): Promise<SelfTestState>;
  /** What this app saw of Root, sent with each run and added to copied reports. */
  clientInfo(): Promise<Record<string, unknown>>;
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
  readonly selfTest?: SelfTestApi;
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
  editGoal(goalId: string, text: string): Promise<MyStatusDto>;
  clearDoneGoals(): Promise<MyStatusDto>;
  /** Open goals, top first. */
  reorderGoals(goalIds: string[]): Promise<MyStatusDto>;
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
  /** Marks this break's challenge done. */
  completeBreakChallenge(): Promise<SnapshotDto>;
  /** High-fives another member on a break with 👋 or 🔥. */
  sendHighFive(userId: string, emoji: string): Promise<SnapshotDto>;
  /** Sends an anonymous note to the developer. */
  sendFeedback(text: string): Promise<void>;
  /** Another member's public game stats, for their profile card. */
  getMemberProfile(userId: string): Promise<MemberProfileDto>;
  /** The community's voice channels for the Room settings dropdown, and the current pick. */
  getVoiceChannels(): Promise<VoiceChannelChoiceDto>;
  /** Admins only: saves the voice channel ("" clears the pick). */
  setVoiceChannel(channelId: string): Promise<VoiceChannelChoiceDto>;
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
