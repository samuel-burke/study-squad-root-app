import {
  voiceChannelChoiceToProto,
  leaderboardMetricFromProto,
  leaderboardPeriodFromProto,
  leaderboardToProto,
  memberProfileToProto,
  myStatusToProto,
  progressToProto,
  snapshotToProto,
} from "@studyroom/contract";
import {
  DomainError,
  ErrorCode,
  RateLimiter,
  type Logger,
  type StudyRoomEngine,
} from "@studyroom/core";
import type {
  AddGoalRequest,
  DeleteGoalRequest,
  EditGoalRequest,
  FeedbackSent,
  GetMemberProfileRequest,
  JoinRoomTimerRequest,
  GetLeaderboardRequest,
  Leaderboard,
  MemberProfile,
  MyStatus,
  Progress,
  ReorderGoalsRequest,
  RoomSnapshot,
  SetGoalDoneRequest,
  SetBadgeShowcaseRequest,
  SetCardStyleRequest,
  SetGoalsPrivateRequest,
  SendFeedbackRequest,
  SendHighFiveRequest,
  SetLeaderboardHiddenRequest,
  SetVoiceChannelRequest,
  StartSoloRequest,
  VoiceChannelChoice,
  SelfTest as SelfTestMessage,
  RunSelfTestRequest,
  ConfirmSelfTestPingRequest,
} from "@studyroom/gen-shared";
import type { VoiceChannelPicker } from "./adapters/voiceChannelPicker";
import type { ClientInfo, SelfTest } from "./selfTest";

/** An error that is safe to show the caller. */
export class RequestFailure extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "RequestFailure";
  }
}

export interface HandlerOptions {
  /** Mutations per user: burst size and refill rate. */
  writeLimit?: { capacity: number; perSecond: number };
  readLimit?: { capacity: number; perSecond: number };
  now?: () => number;
  /** The in-app voice channel dropdown. Absent in tests that don't need it. */
  voicePicker?: Pick<VoiceChannelPicker, "choice" | "pick">;
  /** The owner-only self-test panel. Absent in tests that don't need it. */
  selfTest?: Pick<SelfTest, "listedElsewhere" | "allowed" | "report" | "start" | "confirmPing">;
}

/**
 * Request handling with no Root SDK dependency, so it can be tested directly.
 * The user id always comes from the authenticated Root connection; requests
 * never carry one. Every request is rate limited per user, validated by the
 * engine, and failures are reduced to a code and a safe message.
 */
export class StudyRoomHandlers {
  private readonly writes: RateLimiter;
  private readonly reads: RateLimiter;
  private readonly voicePicker: HandlerOptions["voicePicker"];
  private readonly selfTest: HandlerOptions["selfTest"];

  constructor(
    private readonly engine: StudyRoomEngine,
    private readonly logger: Logger,
    options: HandlerOptions = {},
  ) {
    const now = options.now ?? Date.now;
    const write = options.writeLimit ?? { capacity: 20, perSecond: 2 };
    const read = options.readLimit ?? { capacity: 30, perSecond: 5 };
    this.writes = new RateLimiter(write.capacity, write.perSecond, now);
    this.reads = new RateLimiter(read.capacity, read.perSecond, now);
    this.voicePicker = options.voicePicker;
    this.selfTest = options.selfTest;
  }

  getSelfTest(userId: string, communityId: string): Promise<SelfTestMessage> {
    return this.handle("getSelfTest", userId, "read", async () => {
      if (this.selfTest?.listedElsewhere(userId, communityId)) {
        // Only in the server log (Root's log viewer), so a wrong community id
        // in the secret can be spotted without showing ids in the app.
        this.logger.info("self-test: listed user in a community that isn't listed", {
          communityId,
        });
      }
      return this.selfTestState(userId, communityId);
    });
  }

  runSelfTest(
    userId: string,
    communityId: string,
    request: RunSelfTestRequest,
  ): Promise<SelfTestMessage> {
    return this.handle("runSelfTest", userId, "write", async () => {
      const selfTest = this.allowedSelfTest(userId, communityId);
      let client: ClientInfo;
      try {
        client = request.clientJson ? (JSON.parse(request.clientJson) as ClientInfo) : {};
      } catch {
        client = {};
      }
      await selfTest.start(userId, { testPost: request.testPost, client });
      return this.selfTestState(userId, communityId);
    });
  }

  confirmSelfTestPing(
    userId: string,
    communityId: string,
    request: ConfirmSelfTestPingRequest,
  ): Promise<SelfTestMessage> {
    return this.handle("confirmSelfTestPing", userId, "read", async () => {
      this.allowedSelfTest(userId, communityId).confirmPing(userId, request.nonce);
      return this.selfTestState(userId, communityId);
    });
  }

  private allowedSelfTest(userId: string, communityId: string) {
    // Checked on every call: hiding the button is not the protection.
    if (!this.selfTest?.allowed(userId, communityId)) {
      throw new DomainError(
        ErrorCode.Forbidden,
        "The self-test is only for the app's developer, in the staging community.",
      );
    }
    return this.selfTest;
  }

  private selfTestState(userId: string, communityId: string): SelfTestMessage {
    const allowed = this.selfTest?.allowed(userId, communityId) ?? false;
    const report = allowed ? this.selfTest!.report() : null;
    return {
      allowed,
      reportJson: report ? JSON.stringify(report) : "",
    };
  }

  getVoiceChannels(userId: string): Promise<VoiceChannelChoice> {
    return this.handle("getVoiceChannels", userId, "read", async () =>
      voiceChannelChoiceToProto(await this.picker().choice(userId)),
    );
  }

  setVoiceChannel(userId: string, request: SetVoiceChannelRequest): Promise<VoiceChannelChoice> {
    return this.handle("setVoiceChannel", userId, "write", async () =>
      voiceChannelChoiceToProto(await this.picker().pick(userId, request.channelId)),
    );
  }

  private picker() {
    if (!this.voicePicker) {
      throw new DomainError(ErrorCode.NotFound, "Voice channel settings aren't available.");
    }
    return this.voicePicker;
  }

  getRoom(userId: string): Promise<RoomSnapshot> {
    return this.handle("getRoom", userId, "read", async () =>
      snapshotToProto(await this.engine.getSnapshot(userId)),
    );
  }

  getProgress(userId: string): Promise<Progress> {
    return this.handle("getProgress", userId, "read", async () =>
      progressToProto(await this.engine.getProgress(userId)),
    );
  }

  getLeaderboard(userId: string, request: GetLeaderboardRequest): Promise<Leaderboard> {
    return this.handle("getLeaderboard", userId, "read", async () =>
      leaderboardToProto(
        await this.engine.getLeaderboard(
          userId,
          leaderboardMetricFromProto(request.by),
          leaderboardPeriodFromProto(request.period),
        ),
      ),
    );
  }

  getMemberProfile(userId: string, request: GetMemberProfileRequest): Promise<MemberProfile> {
    return this.handle("getMemberProfile", userId, "read", async () =>
      memberProfileToProto(await this.engine.getMemberProfile(request.userId)),
    );
  }

  setLeaderboardHidden(userId: string, request: SetLeaderboardHiddenRequest): Promise<Leaderboard> {
    return this.handle("setLeaderboardHidden", userId, "write", async () =>
      leaderboardToProto(
        await this.engine.setLeaderboardHidden(
          userId,
          request.hidden,
          leaderboardMetricFromProto(request.by),
          leaderboardPeriodFromProto(request.period),
        ),
      ),
    );
  }

  sendFeedback(userId: string, request: SendFeedbackRequest): Promise<FeedbackSent> {
    return this.handle("sendFeedback", userId, "write", async () => {
      await this.engine.sendFeedback(userId, request.text);
      return {};
    });
  }

  joinRoomTimer(userId: string, request: JoinRoomTimerRequest): Promise<RoomSnapshot> {
    return this.handle("joinRoomTimer", userId, "write", async () =>
      snapshotToProto(
        await this.engine.joinRoomTimer(userId, {
          goals: request.goals,
          goalsPrivate: request.goalsPrivate,
        }),
      ),
    );
  }

  leaveRoomTimer(userId: string): Promise<RoomSnapshot> {
    return this.handle("leaveRoomTimer", userId, "write", async () =>
      snapshotToProto(await this.engine.leaveRoomTimer(userId)),
    );
  }

  startSolo(userId: string, request: StartSoloRequest): Promise<RoomSnapshot> {
    return this.handle("startSolo", userId, "write", async () =>
      snapshotToProto(
        await this.engine.startSolo(userId, request.minutes, {
          goals: request.goals,
          goalsPrivate: request.goalsPrivate,
        }),
      ),
    );
  }

  endSolo(userId: string): Promise<RoomSnapshot> {
    return this.handle("endSolo", userId, "write", async () =>
      snapshotToProto(await this.engine.endSolo(userId)),
    );
  }

  addGoal(userId: string, request: AddGoalRequest): Promise<MyStatus> {
    return this.handle("addGoal", userId, "write", async () =>
      myStatusToProto(await this.engine.addGoal(userId, request.text)),
    );
  }

  setGoalDone(userId: string, request: SetGoalDoneRequest): Promise<MyStatus> {
    return this.handle("setGoalDone", userId, "write", async () =>
      myStatusToProto(await this.engine.setGoalDone(userId, request.goalId, request.done)),
    );
  }

  deleteGoal(userId: string, request: DeleteGoalRequest): Promise<MyStatus> {
    return this.handle("deleteGoal", userId, "write", async () =>
      myStatusToProto(await this.engine.deleteGoal(userId, request.goalId)),
    );
  }

  editGoal(userId: string, request: EditGoalRequest): Promise<MyStatus> {
    return this.handle("editGoal", userId, "write", async () =>
      myStatusToProto(await this.engine.editGoal(userId, request.goalId, request.text)),
    );
  }

  clearDoneGoals(userId: string): Promise<MyStatus> {
    return this.handle("clearDoneGoals", userId, "write", async () =>
      myStatusToProto(await this.engine.clearDoneGoals(userId)),
    );
  }

  reorderGoals(userId: string, request: ReorderGoalsRequest): Promise<MyStatus> {
    return this.handle("reorderGoals", userId, "write", async () =>
      myStatusToProto(await this.engine.reorderGoals(userId, request.goalIds)),
    );
  }

  setGoalsPrivate(userId: string, request: SetGoalsPrivateRequest): Promise<MyStatus> {
    return this.handle("setGoalsPrivate", userId, "write", async () =>
      myStatusToProto(await this.engine.setGoalsPrivate(userId, request.goalsPrivate)),
    );
  }

  setCardStyle(userId: string, request: SetCardStyleRequest): Promise<Progress> {
    return this.handle("setCardStyle", userId, "write", async () =>
      progressToProto(await this.engine.setCardStyle(userId, request.style)),
    );
  }

  setBadgeShowcase(userId: string, request: SetBadgeShowcaseRequest): Promise<Progress> {
    return this.handle("setBadgeShowcase", userId, "write", async () =>
      progressToProto(await this.engine.setBadgeShowcase(userId, request.badgeIds)),
    );
  }

  deleteMyData(userId: string): Promise<MyStatus> {
    return this.handle("deleteMyData", userId, "write", async () =>
      myStatusToProto(await this.engine.deleteMyData(userId)),
    );
  }

  completeBreakChallenge(userId: string): Promise<RoomSnapshot> {
    return this.handle("completeBreakChallenge", userId, "write", async () =>
      snapshotToProto(await this.engine.completeBreakChallenge(userId)),
    );
  }

  sendHighFive(userId: string, request: SendHighFiveRequest): Promise<RoomSnapshot> {
    return this.handle("sendHighFive", userId, "write", async () =>
      snapshotToProto(await this.engine.sendHighFive(userId, request.toUserId, request.emoji)),
    );
  }

  keepGoing(userId: string): Promise<MyStatus> {
    return this.handle("keepGoing", userId, "write", async () =>
      myStatusToProto(await this.engine.keepGoing(userId)),
    );
  }

  private async handle<T>(
    operation: string,
    userId: string,
    kind: "read" | "write",
    work: () => Promise<T>,
  ): Promise<T> {
    if (typeof userId !== "string" || userId.length === 0) {
      throw new RequestFailure(ErrorCode.Validation, "Missing caller identity.");
    }
    const limiter = kind === "write" ? this.writes : this.reads;
    if (!limiter.tryTake(userId)) {
      this.logger.warn("rate limited", { operation, userId });
      throw new RequestFailure(ErrorCode.RateLimited, "Slow down a little and try again.");
    }
    try {
      return await work();
    } catch (error) {
      if (error instanceof DomainError) throw new RequestFailure(error.code, error.message);
      // Unknown errors may carry internals (SQL, paths). Log them, return something generic.
      this.logger.error("request failed", {
        operation,
        userId,
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      });
      throw new RequestFailure(ErrorCode.Internal, "Something went wrong. Please try again.");
    }
  }
}
