import { PERMISSION, VOICE_TYPES, memberName, type DiscordApi } from "./discordApi";

/** Root's channel types, as the server compares them (ChannelType in @rootsdk/server-app). */
export const ROOT_CHANNEL_TYPE = { Text: 1, Voice: 4 };

/** Discord has no channel groups the server needs, so every channel sits in this one. */
export const ALL_CHANNELS_GROUP = "all";

/**
 * Root's mention markup, [@Name](root://user/id), as the server writes it.
 * Discord's is <@id>.
 */
const ROOT_MENTION = /\[@[^\]]*\]\(root:\/\/user\/(\d{5,25})\)/g;

/** Rewrites Root mentions as Discord ones and returns who they ping. */
export function toDiscordMentions(content: string): { content: string; userIds: string[] } {
  const userIds: string[] = [];
  const out = content.replace(ROOT_MENTION, (_match, id: string) => {
    userIds.push(id);
    return `<@${id}>`;
  });
  return { content: out, userIds: [...new Set(userIds)] };
}

/** Root's role permissions, from a Discord permission bitfield. */
export function rootPermissions(bitfield: string) {
  const bits = BigInt(bitfield);
  const admin = (bits & PERMISSION.administrator) !== 0n;
  const manage = (bits & PERMISSION.manageGuild) !== 0n;
  return {
    communityFullControl: admin,
    communityManageCommunity: manage,
    communityManageApps: manage,
  };
}

/**
 * The slice of Root's `rootServer.community` the server uses, answered from
 * one Discord server. A Discord server's @everyone role id is the server's id.
 */
export function discordCommunity(guildId: string, api: DiscordApi) {
  // One post at a time per channel, so a burst (a recap plus badge posts)
  // goes out in order and doesn't trip Discord's per-channel rate limit.
  const queues = new Map<string, Promise<unknown>>();
  const postInOrder = (channelId: string, content: string) => {
    const message = toDiscordMentions(content);
    const previous = queues.get(channelId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => api.post(channelId, message.content, message.userIds));
    queues.set(channelId, next);
    void next
      .finally(() => {
        if (queues.get(channelId) === next) queues.delete(channelId);
      })
      .catch(() => undefined);
    return next;
  };
  return {
    communities: {
      get: async () => {
        const guild = await api.guild(guildId);
        return { id: guild.id, name: guild.name, ownerUserId: guild.owner_id };
      },
    },
    channelGroups: {
      list: async () => [{ id: ALL_CHANNELS_GROUP, name: "All channels", communityId: guildId }],
    },
    channels: {
      list: async (_request: { channelGroupId: string }) =>
        (await api.channels(guildId))
          .filter((c) => c.type === 0 || VOICE_TYPES.has(c.type))
          .map((c) => ({
            id: c.id,
            name: c.name ?? "",
            channelGroupId: ALL_CHANNELS_GROUP,
            channelType: VOICE_TYPES.has(c.type) ? ROOT_CHANNEL_TYPE.Voice : ROOT_CHANNEL_TYPE.Text,
          })),
      get: async ({ id }: { id: string }) => {
        const c = await api.channel(id);
        return { id: c.id, name: c.name ?? "" };
      },
    },
    communityLinks: {
      communityChannelCreate: async ({ channelId }: { channelId: string }) => ({
        url: `https://discord.com/channels/${guildId}/${channelId}`,
      }),
    },
    channelMessages: {
      // Reading chat needs Discord's privileged message content intent, so
      // the developer's chat commands are Root only for now.
      on: () => undefined,
      off: () => undefined,
      create: ({ channelId, content }: { channelId: string; content: string }) =>
        postInOrder(channelId, content),
    },
    communityMembers: {
      get: async ({ userId }: { userId: string }) => ({
        userId,
        communityId: guildId,
        nickname: memberName(await api.member(guildId, userId)),
      }),
    },
    communityMemberRoles: {
      list: async ({ userId }: { userId: string }) => ({
        userId,
        communityRoleIds: (await api.member(guildId, userId)).roles,
      }),
    },
    communityRoles: {
      list: async () =>
        (await api.roles(guildId)).map((role) => ({
          id: role.id,
          name: role.name,
          communityPermission: rootPermissions(role.permissions),
        })),
    },
    // Who is in a voice channel needs Discord's live gateway; until then
    // nobody shows as in voice.
    channelWebRtcs: {
      list: async (_request: { channelId: string }) => ({ members: [] }),
      on: () => undefined,
      off: () => undefined,
    },
  };
}
