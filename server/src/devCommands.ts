import {
  badgeById,
  DomainError,
  type DevAction,
  type Logger,
  type MyStatusDto,
  type Notifier,
  type PersonalResultDto,
  type PhaseCompletedDto,
  type SnapshotDto,
} from "@studyroom/core";

/**
 * The developer's chat commands, typed in any channel the app can see.
 * Only user ids on the self-test list (SELF_TEST_USER_IDS) are answered;
 * everyone else's messages are ignored without a reply. Commands that change
 * real data also need Developer test mode on in that community, which the
 * engine checks too. Messages are only read to spot a command: nothing is
 * stored or logged.
 */

export interface DevCommandDeps {
  allowed(userId: string): boolean;
  /** Developer test mode, from the community's app settings. */
  testMode(): boolean;
  reply(channelId: string, text: string): Promise<void>;
  smoke(userId: string, channelId: string): Promise<void>;
  admin(action: DevAction): Promise<string>;
  startTestRound(userId: string): Promise<SnapshotDto>;
  snapshot(userId: string): Promise<SnapshotDto>;
  /** Moves the game clock forward and settles everything now due. Returns the new offset. */
  advanceClock(ms: number): Promise<number>;
  clockOffset(): number;
  /** Wipes the community's data (through the engine) and puts the clock back to real time. */
  reset(): Promise<string>;
  /** Pushes that reach only the developer's own open app. */
  notifier: Pick<Notifier, "personalResult" | "myStatusUpdated" | "badgesEarned" | "highFive">;
  celebrate(userId: string, event: PhaseCompletedDto): void;
  logger: Logger;
}

export interface ChatMessage {
  userId: string;
  channelId: string;
  content: string;
}

const HELP = [
  "🧪 Developer commands (only you can use them):",
  "`!smoke`: run the smoke test",
  "`!preview badge <id>` · `!preview levelup` · `!preview break` · `!preview highfive` · `!preview keepgoing` · `!preview celebrate`: play it on your open app only, nothing saved",
  "With Developer test mode on in this community's app settings:",
  "`!test round`: a real 1-minute solo and 1-minute break",
  "`!xp <who> <n>` · `!level <who> <n>` · `!streak <who> <n>` · `!badge <who> <id>` · `!end <who>`: who is `me` or an @mention",
  "`!boss hp <n>` · `!boss defeat` · `!boss new`",
  "`!room skip` · `!room stop`",
  "`!clock +30m` · `!clock +1h` · `!clock +1d` · `!clock +1w` · `!clock`: jump the game clock forward (it can't go back)",
  "`!recap` · `!botline`",
  "`!reset confirm`: wipe this community's Study Squad data and put the clock back to real time",
].join("\n");

const UNITS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
/** The furthest one jump may go. */
const MAX_JUMP_MS = 4 * UNITS.w!;

/** Root's mention markup is [@Name](root://user/<id>). */
const MENTION = /root:\/\/user\/([A-Za-z0-9_-]+)/;

export function isDevCommand(content: string | undefined): boolean {
  return /^!\w/.test((content ?? "").trim());
}

export class DevCommands {
  constructor(private readonly deps: DevCommandDeps) {}

  /** Handles one channel message. Never throws. */
  async handle(message: ChatMessage): Promise<void> {
    if (!isDevCommand(message.content) || !this.deps.allowed(message.userId)) return;
    let text: string;
    try {
      text = await this.run(message);
    } catch (error) {
      text =
        error instanceof DomainError
          ? `🧪 ${error.message}`
          : "🧪 That command failed. The server log has the details.";
      if (!(error instanceof DomainError))
        this.deps.logger.warn("dev command failed", { error: String(error) });
    }
    if (!text) return;
    await this.deps
      .reply(message.channelId, text)
      .catch((error: unknown) =>
        this.deps.logger.warn("dev command reply failed", { error: String(error) }),
      );
  }

  private async run({ userId, channelId, content }: ChatMessage): Promise<string> {
    const words = content.trim().split(/\s+/);
    const command = words[0]!.slice(1).toLowerCase();
    const args = words.slice(1);
    const arg = (i: number) => (args[i] ?? "").toLowerCase();
    const who = () => this.target(userId, content);
    const number = (value: string | undefined) => {
      const n = Number(value);
      if (!Number.isInteger(n)) throw new DomainError(1001, "That needs a whole number.");
      return n;
    };
    const last = () => args[args.length - 1];

    switch (command) {
      case "help":
        return HELP;
      case "smoke":
        await this.deps.smoke(userId, channelId);
        return ""; // the smoke test posts its own summary
      case "preview":
        return this.preview(userId, arg(0), args[1]);
      case "test":
        if (arg(0) !== "round") return "🧪 Did you mean `!test round`?";
        this.requireTestMode();
        await this.deps.startTestRound(userId);
        return "🧪 Started a 1-minute test round for you, then a 1-minute break. Open the app to watch it.";
      case "xp":
        return `🧪 ${await this.deps.admin({ kind: "setXp", userId: who(), value: number(last()) })}`;
      case "level":
        return `🧪 ${await this.deps.admin({ kind: "setLevel", userId: who(), value: number(last()) })}`;
      case "streak":
        return `🧪 ${await this.deps.admin({ kind: "setStreak", userId: who(), value: number(last()) })}`;
      case "badge": {
        const badgeId = last() ?? "";
        return `🧪 ${await this.deps.admin({ kind: "grantBadge", userId: who(), badgeId })}`;
      }
      case "end":
        return `🧪 ${await this.deps.admin({ kind: "endTimer", userId: who() })}`;
      case "boss":
        if (arg(0) === "hp")
          return `🧪 ${await this.deps.admin({ kind: "bossHp", value: number(args[1]) })}`;
        if (arg(0) === "defeat")
          return `🧪 ${await this.deps.admin({ kind: "bossDefeat", byUserId: userId })}`;
        if (arg(0) === "new") return `🧪 ${await this.deps.admin({ kind: "bossNew" })}`;
        return "🧪 Try `!boss hp 50`, `!boss defeat` or `!boss new`.";
      case "room":
        if (arg(0) === "skip") return `🧪 ${await this.deps.admin({ kind: "roomSkip" })}`;
        if (arg(0) === "stop") return `🧪 ${await this.deps.admin({ kind: "roomStop" })}`;
        return "🧪 Try `!room skip` or `!room stop`.";
      case "clock":
        return this.clock(arg(0));
      case "recap":
        return `🧪 ${await this.deps.admin({ kind: "recap" })}`;
      case "reset":
        if (arg(0) !== "confirm")
          return "🧪 This wipes all of this community's Study Squad data. Type `!reset confirm` to do it.";
        this.requireTestMode();
        return `🧪 ${await this.deps.reset()}`;
      case "botline":
        return `🧪 ${await this.deps.admin({ kind: "botLine", byUserId: userId })}`;
      default:
        return "🧪 I don't know that one. `!help` lists the commands.";
    }
  }

  /** `me`, or the first @mention in the message. */
  private target(userId: string, content: string): string {
    const mention = MENTION.exec(content);
    if (mention) return mention[1]!;
    if (/(^|\s)me(\s|$)/i.test(content)) return userId;
    throw new DomainError(1001, "Say who: `me` or an @mention.");
  }

  private requireTestMode(): void {
    if (!this.deps.testMode())
      throw new DomainError(
        1005,
        "Developer test mode is off here. Turn it on in Study Squad's app settings first.",
      );
  }

  private async clock(change: string): Promise<string> {
    if (!change) return `🧪 The game clock is ${describe(this.deps.clockOffset())} ahead.`;
    this.requireTestMode();
    const match = /^\+(\d+)([mhdw])$/.exec(change);
    if (!match) return "🧪 Try `!clock +1h`, `+30m`, `+1d` or `+1w`. It only goes forward.";
    const ms = Number(match[1]) * UNITS[match[2]!]!;
    if (ms <= 0 || ms > MAX_JUMP_MS) return "🧪 Jump between 1 minute and 4 weeks at a time.";
    const offset = await this.deps.advanceClock(ms);
    return `🧪 Jumped ${describe(ms)}. The game clock is now ${describe(offset)} ahead of real time, and stays that way.`;
  }

  private async preview(userId: string, what: string, detail: string | undefined) {
    const { me, room } = await this.deps.snapshot(userId);
    const now = room.serverNow;
    const n = this.deps.notifier;
    switch (what) {
      case "badge": {
        const badge = badgeById(detail ?? "");
        if (!badge) return "🧪 Which badge? For example `!preview badge night-owl`.";
        n.badgesEarned(userId, [badge.id]);
        return `🧪 Playing ${badge.name} on your screen.`;
      }
      case "levelup":
        n.myStatusUpdated(userId, { ...me, level: me.level + 1 } satisfies MyStatusDto);
        return `🧪 Showing level ${me.level + 1} on your screen until the next update.`;
      case "break":
        n.personalResult(userId, fakeResult(userId, me, now));
        return "🧪 Showing a break screen on your screen. Nothing was saved.";
      case "highfive":
        n.highFive(userId, { fromUserId: userId, emoji: "🔥" });
        return "🧪 Sent a high-five to your screen.";
      case "keepgoing":
        n.myStatusUpdated(userId, { ...me, keepGoingEndsAt: now + 30_000 });
        return '🧪 Showing "Keep going?" on your screen for 30 seconds.';
      case "celebrate":
        this.deps.celebrate(userId, {
          kind: "focus",
          round: Math.max(1, room.timer.round),
          finisherIds: [userId],
          roomDamageXp: 50,
          combo: 1,
          room,
        });
        return "🧪 Playing the end-of-round celebration on your screen.";
      default:
        return "🧪 Preview one of: `badge <id>`, `levelup`, `break`, `highfive`, `keepgoing`, `celebrate`.";
    }
  }
}

function fakeResult(userId: string, me: MyStatusDto, now: number): PersonalResultDto {
  return {
    source: "solo",
    round: 1,
    focusedMinutes: 25,
    finished: true,
    baseXp: 50,
    combo: 1,
    xpEarned: 50,
    streak: me.streak,
    streakExtended: true,
    finisherIds: [userId],
    roomDamageXp: 50,
    bossOutcome: "hit",
    goalPrompt: null,
    breakEndsAt: now + 5 * 60_000,
    me,
  };
}

function describe(ms: number): string {
  if (ms <= 0) return "0 minutes";
  const parts: string[] = [];
  let rest = ms;
  for (const [size, name] of [
    [UNITS.w!, "week"],
    [UNITS.d!, "day"],
    [UNITS.h!, "hour"],
    [UNITS.m!, "minute"],
  ] as const) {
    const count = Math.floor(rest / size);
    if (count > 0) parts.push(`${count} ${name}${count === 1 ? "" : "s"}`);
    rest -= count * size;
  }
  return parts.join(" ") || "under a minute";
}
