import {
  cleanText,
  DomainError,
  ErrorCode,
  LIMITS,
  safeDisplayName,
  SerialQueue,
  validateId,
  type Logger,
  type ScheduledSessionDto,
} from "@studyroom/core";

/** Where the upcoming sessions live in the app's key-value table. */
export const SCHEDULE_KEY = "scheduledSessions";
const TAG_PREFIX = "session:";
const MAX_PER_MEMBER = 3;
const MAX_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;
/** A reminder that fires this late is skipped (say, the app was down). */
const MISSED_GRACE_MS = 2 * 60 * 60 * 1000;
/** People pinged in a reminder; the rest are counted. */
const MAX_PINGS = 10;
/** Root user ids are 22 base64url characters; anything else is written as a plain name. */
const MENTIONABLE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface SessionScheduleDeps {
  store: {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
  };
  scheduleOnce(tag: string, at: Date): Promise<void>;
  cancelByTag(tag: string): Promise<void>;
  /** Posts in the bot messages channel, if admins picked one. */
  post(content: string): Promise<void>;
  nickname(userId: string): Promise<string | undefined>;
  /** Pushes the new list to everyone with the app open. */
  changed(sessions: ScheduledSessionDto[]): void;
  timeZone(): string;
  newId(): string;
  now(): number;
  logger: Logger;
}

/**
 * Members schedule a study session ("Sunday exam cram, 7pm"). It's announced
 * in the channel, and a Root one-time job posts a reminder when it starts.
 * Anyone can schedule; only the member who scheduled one can cancel it.
 * Members tap "I'm in" to be @mentioned in the reminder.
 */
export class SessionSchedule {
  private readonly queue = new SerialQueue();

  constructor(private readonly deps: SessionScheduleDeps) {}

  /** Upcoming sessions, soonest first. */
  async list(): Promise<ScheduledSessionDto[]> {
    const now = this.deps.now();
    const all = (await this.deps.store.get<ScheduledSessionDto[]>(SCHEDULE_KEY)) ?? [];
    return all.filter((s) => s.startsAtMs > now).sort((a, b) => a.startsAtMs - b.startsAtMs);
  }

  add(userId: string, title: unknown, startsAtMs: unknown): Promise<ScheduledSessionDto[]> {
    return this.queue.run(async () => {
      const text = typeof title === "string" ? cleanText(title) : "";
      if (!text) throw invalid("Give the session a name.");
      if (text.length > LIMITS.scheduledTitleMaxLength) {
        throw invalid(`Keep the name under ${LIMITS.scheduledTitleMaxLength} characters.`);
      }
      const now = this.deps.now();
      if (typeof startsAtMs !== "number" || !(startsAtMs > now)) {
        throw invalid("Pick a time in the future.");
      }
      if (startsAtMs > now + MAX_AHEAD_MS) throw invalid("Pick a time in the next 30 days.");
      const sessions = await this.list();
      if (sessions.filter((s) => s.byUserId === userId).length >= MAX_PER_MEMBER) {
        throw invalid(`You can have ${MAX_PER_MEMBER} sessions scheduled at a time.`);
      }
      const session = {
        id: this.deps.newId(),
        title: text,
        startsAtMs,
        byUserId: userId,
        goingUserIds: [userId],
      };
      await this.deps.scheduleOnce(TAG_PREFIX + session.id, new Date(startsAtMs));
      await this.save([...sessions, session]);
      await this.post(
        `📅 ${await this.name(userId)} scheduled **${safeTitle(text)}** for ${this.when(startsAtMs)}. Tap "I'm in" in Study Squad to get a ping when it starts.`,
      );
      return this.list();
    });
  }

  /** "I'm in" (going) or not. */
  rsvp(userId: string, id: unknown, going: boolean): Promise<ScheduledSessionDto[]> {
    return this.queue.run(async () => {
      const sessions = await this.list();
      const session = this.find(sessions, id);
      const others = session.goingUserIds.filter((u) => u !== userId);
      session.goingUserIds = going ? [...others, userId] : others;
      await this.save(sessions);
      return this.list();
    });
  }

  cancel(userId: string, id: unknown): Promise<ScheduledSessionDto[]> {
    return this.queue.run(async () => {
      const sessions = await this.list();
      const session = this.find(sessions, id);
      if (session.byUserId !== userId) {
        throw new DomainError(
          ErrorCode.Forbidden,
          "Only the person who scheduled it can cancel it.",
        );
      }
      await this.deps.cancelByTag(TAG_PREFIX + session.id);
      await this.save(sessions.filter((s) => s !== session));
      return this.list();
    });
  }

  /** Delete my data: drops the member's sessions and RSVPs. */
  forget(userId: string): Promise<void> {
    return this.queue.run(async () => {
      const sessions = await this.list();
      for (const s of sessions.filter((s) => s.byUserId === userId)) {
        await this.deps.cancelByTag(TAG_PREFIX + s.id);
      }
      await this.save(
        sessions
          .filter((s) => s.byUserId !== userId)
          .map((s) => ({ ...s, goingUserIds: s.goingUserIds.filter((u) => u !== userId) })),
      );
    });
  }

  /** Root's job event. Never throws: it runs inside the SDK's job loop. */
  onJob(tag: string | null | undefined): Promise<void> {
    if (!tag?.startsWith(TAG_PREFIX)) return Promise.resolve();
    const id = tag.slice(TAG_PREFIX.length);
    return this.queue
      .run(async () => {
        const all = (await this.deps.store.get<ScheduledSessionDto[]>(SCHEDULE_KEY)) ?? [];
        const session = all.find((s) => s.id === id);
        await this.save(all.filter((s) => s.id !== id && s.startsAtMs > this.deps.now()));
        if (!session || this.deps.now() - session.startsAtMs > MISSED_GRACE_MS) return;
        // Everyone listed tapped "I'm in", so they asked for this ping.
        const going = session.goingUserIds;
        const pings: string[] = [];
        for (const u of going.slice(0, MAX_PINGS)) pings.push(await this.mention(u));
        const more = going.length - pings.length;
        const who = pings.length ? ` ${pings.join(" ")}${more > 0 ? ` +${more} more` : ""}` : "";
        await this.post(
          `⏰ **${safeTitle(session.title)}** starts now!${who} Open Study Squad and join the room timer.`,
        );
      })
      .catch((error: unknown) =>
        this.deps.logger.error("scheduled session reminder failed", { error: String(error) }),
      );
  }

  private find(sessions: ScheduledSessionDto[], id: unknown): ScheduledSessionDto {
    const sessionId = validateId(id, "session");
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) throw new DomainError(ErrorCode.NotFound, "That session isn't scheduled.");
    return session;
  }

  private async save(sessions: ScheduledSessionDto[]): Promise<void> {
    await this.deps.store.set(SCHEDULE_KEY, sessions);
    this.deps.changed(await this.list());
  }

  private async name(userId: string): Promise<string> {
    return safeDisplayName(await this.deps.nickname(userId).catch(() => undefined));
  }

  /** Root's mention markup, which pings the member: [@Name](root://user/id). */
  private async mention(userId: string): Promise<string> {
    const name = await this.name(userId);
    return MENTIONABLE_ID.test(userId) ? `[@${name}](root://user/${userId})` : name;
  }

  private async post(content: string): Promise<void> {
    try {
      await this.deps.post(content);
    } catch (error) {
      // The session is saved either way; the post is a nice-to-have.
      this.deps.logger.warn("scheduled session post failed", { error: String(error) });
    }
  }

  private when(ms: number): string {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: this.deps.timeZone(),
      timeZoneName: "short",
    }).format(ms);
  }
}

const invalid = (message: string) => new DomainError(ErrorCode.Validation, message);

/** Titles go in channel posts, so strip anything read as markup or a mention. */
const safeTitle = (title: string) => title.replace(/[@<>*_~`|#[\]()\\]/g, "").trim() || "A session";
