import {
  bossDefeatedPost,
  busyRoomPost,
  dailyRecapPost,
  safeDisplayName,
  SQUAD_MAX_MENTIONS,
  squadPost,
  streakMilestonePost,
  type Announcer,
  type SquadEvent,
  type RecapDto,
} from "@studyroom/core";

export interface ChannelPort {
  postMessage(channelId: string, content: string): Promise<void>;
  /** The member's community nickname, unsanitised. */
  nickname(userId: string): Promise<string | undefined>;
}

const NAME_TTL_MS = 10 * 60 * 1000;
/**
 * Root user ids are GUIDs written as 22 base64url characters, so they can hold
 * "-" and "_". Anything else is written as a plain name, never a link.
 */
const MENTIONABLE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Formats and posts channel messages. Display names are sanitised before use. */
export class ChannelAnnouncer implements Announcer {
  private readonly names = new Map<string, { name: string; at: number }>();

  constructor(
    private readonly channel: ChannelPort,
    private readonly now: () => number = Date.now,
  ) {}

  async busyRoom(channelId: string, focusingCount: number, combo: number): Promise<void> {
    await this.channel.postMessage(channelId, busyRoomPost(focusingCount, combo));
  }

  async streakMilestone(channelId: string, userId: string, streak: number): Promise<void> {
    await this.channel.postMessage(
      channelId,
      streakMilestonePost(await this.displayName(userId), streak),
    );
  }

  async bossDefeated(
    channelId: string,
    bossName: string,
    contributorCount: number,
    lootXp: number,
  ): Promise<void> {
    await this.channel.postMessage(
      channelId,
      bossDefeatedPost(safeDisplayName(bossName), contributorCount, lootXp),
    );
  }

  async dailyRecap(channelId: string, recap: RecapDto): Promise<void> {
    const names = new Map<string, string>();
    for (const { userId } of [...recap.topStreaks, ...recap.topFocus]) {
      if (!names.has(userId)) names.set(userId, await this.displayName(userId));
    }
    const safeRecap = recap.boss
      ? { ...recap, boss: { ...recap.boss, name: safeDisplayName(recap.boss.name) } }
      : recap;
    await this.channel.postMessage(channelId, dailyRecapPost(safeRecap, names));
  }

  async squadMessage(
    channelId: string,
    event: SquadEvent,
    text: string,
    userIds: string[],
  ): Promise<void> {
    // Only the people the post shows get looked up; the rest are counted.
    const mentions: string[] = [];
    for (const userId of userIds.slice(0, SQUAD_MAX_MENTIONS)) {
      mentions.push(await this.mention(userId));
    }
    await this.channel.postMessage(channelId, squadPost(event, text, mentions, userIds.length));
  }

  /** Root's mention markup, which pings the member: [@Name](root://user/id). */
  private async mention(userId: string): Promise<string> {
    const name = await this.displayName(userId);
    return MENTIONABLE_ID.test(userId) ? `[@${name}](root://user/${userId})` : name;
  }

  private async displayName(userId: string): Promise<string> {
    const cached = this.names.get(userId);
    if (cached && this.now() - cached.at < NAME_TTL_MS) return cached.name;
    let name = "Someone";
    try {
      name = safeDisplayName(await this.channel.nickname(userId));
    } catch {
      // A missing profile shouldn't block the post.
    }
    this.names.set(userId, { name, at: this.now() });
    return name;
  }
}
