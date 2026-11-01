import { RootServerException, type Client } from "@rootsdk/server-app";
import { StudyRoomServiceBase } from "@studyroom/gen-server";
import type {
  AddGoalRequest,
  DeleteGoalRequest,
  DeleteMyDataRequest,
  EndSoloRequest,
  GetLeaderboardRequest,
  GetMemberProfileRequest,
  GetProgressRequest,
  GetRoomRequest,
  KeepGoingRequest,
  JoinRoomTimerRequest,
  Leaderboard,
  LeaveRoomTimerRequest,
  MemberProfile,
  MyStatus,
  Progress,
  RoomSnapshot,
  SetBadgeShowcaseRequest,
  SetCardStyleRequest,
  SetGoalDoneRequest,
  SetGoalsPrivateRequest,
  SetLeaderboardHiddenRequest,
  StartSoloRequest,
} from "@studyroom/gen-shared";
import { RequestFailure, type StudyRoomHandlers } from "./handlers";

/**
 * Thin binding between Root's generated service and the handlers. It only
 * takes the caller's id from the authenticated connection and turns
 * RequestFailure into the exception type the Root client understands.
 */
export class StudyRoomService extends StudyRoomServiceBase {
  private handlers: StudyRoomHandlers | null = null;

  bind(handlers: StudyRoomHandlers): void {
    this.handlers = handlers;
  }

  getRoom(_request: GetRoomRequest, client: Client): Promise<RoomSnapshot> {
    return this.call((h) => h.getRoom(client.userId));
  }

  joinRoomTimer(request: JoinRoomTimerRequest, client: Client): Promise<RoomSnapshot> {
    return this.call((h) => h.joinRoomTimer(client.userId, request));
  }

  leaveRoomTimer(_request: LeaveRoomTimerRequest, client: Client): Promise<RoomSnapshot> {
    return this.call((h) => h.leaveRoomTimer(client.userId));
  }

  startSolo(request: StartSoloRequest, client: Client): Promise<RoomSnapshot> {
    return this.call((h) => h.startSolo(client.userId, request));
  }

  endSolo(_request: EndSoloRequest, client: Client): Promise<RoomSnapshot> {
    return this.call((h) => h.endSolo(client.userId));
  }

  addGoal(request: AddGoalRequest, client: Client): Promise<MyStatus> {
    return this.call((h) => h.addGoal(client.userId, request));
  }

  setGoalDone(request: SetGoalDoneRequest, client: Client): Promise<MyStatus> {
    return this.call((h) => h.setGoalDone(client.userId, request));
  }

  deleteGoal(request: DeleteGoalRequest, client: Client): Promise<MyStatus> {
    return this.call((h) => h.deleteGoal(client.userId, request));
  }

  setGoalsPrivate(request: SetGoalsPrivateRequest, client: Client): Promise<MyStatus> {
    return this.call((h) => h.setGoalsPrivate(client.userId, request));
  }

  getProgress(_request: GetProgressRequest, client: Client): Promise<Progress> {
    return this.call((h) => h.getProgress(client.userId));
  }

  getLeaderboard(request: GetLeaderboardRequest, client: Client): Promise<Leaderboard> {
    return this.call((h) => h.getLeaderboard(client.userId, request));
  }

  getMemberProfile(request: GetMemberProfileRequest, client: Client): Promise<MemberProfile> {
    return this.call((h) => h.getMemberProfile(client.userId, request));
  }

  setLeaderboardHidden(request: SetLeaderboardHiddenRequest, client: Client): Promise<Leaderboard> {
    return this.call((h) => h.setLeaderboardHidden(client.userId, request));
  }

  setCardStyle(request: SetCardStyleRequest, client: Client): Promise<Progress> {
    return this.call((h) => h.setCardStyle(client.userId, request));
  }

  setBadgeShowcase(request: SetBadgeShowcaseRequest, client: Client): Promise<Progress> {
    return this.call((h) => h.setBadgeShowcase(client.userId, request));
  }

  deleteMyData(_request: DeleteMyDataRequest, client: Client): Promise<MyStatus> {
    return this.call((h) => h.deleteMyData(client.userId));
  }

  keepGoing(_request: KeepGoingRequest, client: Client): Promise<MyStatus> {
    return this.call((h) => h.keepGoing(client.userId));
  }

  private async call<T>(work: (handlers: StudyRoomHandlers) => Promise<T>): Promise<T> {
    if (!this.handlers)
      throw new RootServerException(503, "Study Squad is still starting. Try again in a moment.");
    try {
      return await work(this.handlers);
    } catch (error) {
      if (error instanceof RequestFailure) throw new RootServerException(error.code, error.message);
      throw error;
    }
  }
}

export const studyRoomService = new StudyRoomService();
