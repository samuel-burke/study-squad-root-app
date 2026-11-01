import {
  DEFAULT_CONFIG,
  MemoryStore,
  StudyRoomEngine,
  type Announcer,
  type AppConfig,
  type MyStatusDto,
  type Notifier,
  type PersonalResultDto,
  type PhaseCompletedDto,
  type SquadEvent,
  type RecapDto,
  type RoomStateDto,
  type WakeScheduler,
} from "../src";

export const MINUTE = 60_000;
/** Wednesday 2026-10-28 10:00 in New York (UTC-4). */
export const T0 = Date.UTC(2026, 9, 28, 14, 0, 0);

export class FakeClock {
  constructor(public current = T0) {}
  now = () => this.current;
  advance(ms: number) {
    this.current += ms;
  }
}

export class ManualScheduler implements WakeScheduler {
  at: number | null = null;
  private callback: (() => void) | null = null;
  wakeAt(at: number, callback: () => void) {
    this.at = at;
    this.callback = callback;
  }
  cancel() {
    this.at = null;
    this.callback = null;
  }
  /** Fires the pending wake-up if the clock has reached it. */
  fireIfDue(now: number): boolean {
    if (this.at === null || this.callback === null || now < this.at) return false;
    const cb = this.callback;
    this.cancel();
    cb();
    return true;
  }
}

export class RecordingNotifier implements Notifier {
  rooms: RoomStateDto[] = [];
  phases: PhaseCompletedDto[] = [];
  personal: { userId: string; event: PersonalResultDto }[] = [];
  statuses: { userId: string; me: MyStatusDto }[] = [];
  badges: { userId: string; badgeIds: string[] }[] = [];
  roomUpdated(room: RoomStateDto) {
    this.rooms.push(room);
  }
  phaseCompleted(event: PhaseCompletedDto) {
    this.phases.push(event);
  }
  personalResult(userId: string, event: PersonalResultDto) {
    this.personal.push({ userId, event });
  }
  myStatusUpdated(userId: string, me: MyStatusDto) {
    this.statuses.push({ userId, me });
  }
  badgesEarned(userId: string, badgeIds: string[]) {
    this.badges.push({ userId, badgeIds });
  }
  /** Every badge pushed to a member so far. */
  badgesFor(userId: string) {
    return this.badges.filter((b) => b.userId === userId).flatMap((b) => b.badgeIds);
  }
  get lastRoom() {
    return this.rooms.at(-1);
  }
}

export class RecordingAnnouncer implements Announcer {
  posts: { kind: string; channelId: string; detail: unknown }[] = [];
  async busyRoom(channelId: string, focusingCount: number, combo: number) {
    this.posts.push({ kind: "busy", channelId, detail: { focusingCount, combo } });
  }
  async streakMilestone(channelId: string, userId: string, streak: number) {
    this.posts.push({ kind: "milestone", channelId, detail: { userId, streak } });
  }
  async bossDefeated(
    channelId: string,
    bossName: string,
    contributorCount: number,
    lootXp: number,
  ) {
    this.posts.push({ kind: "boss", channelId, detail: { bossName, contributorCount, lootXp } });
  }
  async dailyRecap(channelId: string, recap: RecapDto) {
    this.posts.push({ kind: "recap", channelId, detail: recap });
  }
  async squadMessage(channelId: string, event: SquadEvent, text: string, userIds: string[]) {
    this.posts.push({ kind: "squad", channelId, detail: { event, text, userIds } });
  }
}

export const silentLogger = { info() {}, warn() {}, error() {} };

export function configWith(overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...DEFAULT_CONFIG, postChannelId: "channel-1", ...overrides };
}

/** A seeded random in [0, 1), so tests are repeatable. */
export function seededRandom(seed = 1): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createHarness(
  config: AppConfig = configWith(),
  start = T0,
  random: () => number = seededRandom(),
) {
  const clock = new FakeClock(start);
  const scheduler = new ManualScheduler();
  const notifier = new RecordingNotifier();
  const announcer = new RecordingAnnouncer();
  const store = new MemoryStore();
  let nextId = 1;
  const engine = new StudyRoomEngine({
    store,
    clock,
    scheduler,
    notifier,
    announcer,
    logger: silentLogger,
    config,
    newId: () => `id-${nextId++}`,
    random,
  });

  /** Moves time forward, firing scheduled wake-ups along the way like a real timer would. */
  async function advance(ms: number) {
    const target = clock.current + ms;
    while (scheduler.at !== null && scheduler.at <= target) {
      clock.current = Math.max(clock.current, scheduler.at);
      scheduler.fireIfDue(clock.current);
      await engine.idle();
    }
    clock.current = target;
    await engine.idle();
  }

  return { engine, clock, scheduler, notifier, announcer, store, advance };
}
