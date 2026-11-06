import {
  myStatusToProto,
  personalResultToProto,
  phaseCompletedToProto,
  roomToProto,
} from "@studyroom/contract";
import type {
  HighFiveDto,
  MyStatusDto,
  Notifier,
  PersonalResultDto,
  PhaseCompletedDto,
  RoomStateDto,
} from "@studyroom/core";
import type {
  BadgesEarnedEvent,
  HighFiveEvent,
  MyStatusEvent,
  PersonalResultEvent,
  PhaseCompletedEvent,
  RoomUpdatedEvent,
} from "@studyroom/gen-shared";

export type BroadcastTarget<C> = "all" | C[];

/** The broadcast half of the generated StudyRoomServiceBase. */
export interface Broadcaster<C> {
  broadcastRoomUpdated(message: RoomUpdatedEvent, clients: BroadcastTarget<C>): void;
  broadcastPhaseCompleted(message: PhaseCompletedEvent, clients: BroadcastTarget<C>): void;
  broadcastPersonalResult(message: PersonalResultEvent, clients: BroadcastTarget<C>): void;
  broadcastMyStatus(message: MyStatusEvent, clients: BroadcastTarget<C>): void;
  broadcastBadgesEarned(message: BadgesEarnedEvent, clients: BroadcastTarget<C>): void;
  broadcastHighFive(message: HighFiveEvent, clients: BroadcastTarget<C>): void;
}

/** Timers and a clock, swappable in tests. */
export interface PushTimers {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realTimers: PushTimers = {
  now: Date.now,
  setTimeout: (callback, ms) => {
    const handle = setTimeout(callback, ms);
    // A pending room push must never keep the server process alive on its own.
    handle.unref?.();
    return handle;
  },
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Room-wide pushes go out at most this often. The first change goes out at
 * once; changes after it within the window are bundled into one push of the
 * latest room. In a 50-person room, 50 goal ticks in one second used to send
 * the whole room 2,500 times.
 */
export const ROOM_PUSH_INTERVAL_MS = 1_000;

/**
 * Sends engine events to Root clients. Room-wide events go to everyone;
 * personal ones only to the devices of the member they are about, so nobody
 * receives another member's XP, goals or privacy choice.
 */
export class PushNotifier<C> implements Notifier {
  private lastRoomPushAt = Number.NEGATIVE_INFINITY;
  private pending: { room: RoomStateDto; builtAt: number } | null = null;
  private timer: unknown = null;

  constructor(
    private readonly broadcaster: Broadcaster<C>,
    private readonly findClient: (userId: string) => C | undefined,
    private readonly timers: PushTimers = realTimers,
    private readonly roomPushIntervalMs = ROOM_PUSH_INTERVAL_MS,
  ) {}

  roomUpdated(room: RoomStateDto): void {
    const now = this.timers.now();
    const wait = this.lastRoomPushAt + this.roomPushIntervalMs - now;
    if (wait <= 0 && this.timer === null) {
      this.sendRoom(room);
      return;
    }
    // Only the newest room matters: it replaces any push still waiting.
    this.pending = { room, builtAt: now };
    this.timer ??= this.timers.setTimeout(() => this.flushRoom(), Math.max(0, wait));
  }

  /** Sends a bundled room push now, if one is waiting. */
  flushRoom(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;
    // The room's clock reading moves on by the time it waited, so devices
    // syncing their countdown to it stay in step.
    const waited = Math.max(0, this.timers.now() - pending.builtAt);
    this.sendRoom({ ...pending.room, serverNow: pending.room.serverNow + waited });
  }

  phaseCompleted(event: PhaseCompletedDto): void {
    // The event carries a newer room than any push still waiting.
    if (this.pending) {
      if (this.timer !== null) this.timers.clearTimeout(this.timer);
      this.timer = null;
      this.pending = null;
    }
    this.broadcaster.broadcastPhaseCompleted(phaseCompletedToProto(event), "all");
  }

  personalResult(userId: string, event: PersonalResultDto): void {
    const client = this.findClient(userId);
    if (client) this.broadcaster.broadcastPersonalResult(personalResultToProto(event), [client]);
  }

  myStatusUpdated(userId: string, me: MyStatusDto): void {
    const client = this.findClient(userId);
    if (client) this.broadcaster.broadcastMyStatus({ me: myStatusToProto(me) }, [client]);
  }

  badgesEarned(userId: string, badgeIds: string[]): void {
    const client = this.findClient(userId);
    if (client) this.broadcaster.broadcastBadgesEarned({ badgeIds }, [client]);
  }

  highFive(toUserId: string, event: HighFiveDto): void {
    const client = this.findClient(toUserId);
    if (client) {
      this.broadcaster.broadcastHighFive({ fromUserId: event.fromUserId, emoji: event.emoji }, [
        client,
      ]);
    }
  }

  private sendRoom(room: RoomStateDto): void {
    this.lastRoomPushAt = this.timers.now();
    this.broadcaster.broadcastRoomUpdated({ room: roomToProto(room) }, "all");
  }
}
