/**
 * The few Discord REST calls Study Squad makes. The bot token reads the
 * server (members, roles, channels) and posts in channels; a member's own
 * OAuth token proves who they are.
 */

export const DISCORD_API = "https://discord.com/api/v10";

/** Discord's bitfield flags that count as "can manage Study Squad". */
export const PERMISSION = { administrator: 1n << 3n, manageGuild: 1n << 5n };

/** A Discord channel type that people can talk in by voice (voice or stage). */
export const VOICE_TYPES = new Set([2, 13]);

export class DiscordError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DiscordError";
  }
}

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

export interface DiscordMember {
  user?: DiscordUser;
  nick?: string | null;
  avatar?: string | null;
  roles: string[];
}

export interface DiscordChannel {
  id: string;
  name?: string;
  type: number;
}

export interface DiscordRole {
  id: string;
  name: string;
  permissions: string;
}

export interface DiscordApiOptions {
  botToken: string;
  /** Tests point this at a fake Discord. */
  base?: string;
  fetch?: typeof fetch;
}

/** The name the server shows for a member: server nickname, then display name, then username. */
export function memberName(member: DiscordMember): string {
  return member.nick || member.user?.global_name || member.user?.username || "Someone";
}

export class DiscordApi {
  private readonly base: string;
  private readonly fetch: typeof fetch;

  constructor(private readonly options: DiscordApiOptions) {
    this.base = options.base ?? DISCORD_API;
    this.fetch = options.fetch ?? fetch;
  }

  guild(guildId: string) {
    return this.bot<{ id: string; name: string; owner_id: string }>(`/guilds/${guildId}`);
  }

  channels(guildId: string) {
    return this.bot<DiscordChannel[]>(`/guilds/${guildId}/channels`);
  }

  channel(channelId: string) {
    return this.bot<DiscordChannel>(`/channels/${channelId}`);
  }

  member(guildId: string, userId: string) {
    return this.bot<DiscordMember>(`/guilds/${guildId}/members/${userId}`);
  }

  roles(guildId: string) {
    return this.bot<DiscordRole[]>(`/guilds/${guildId}/roles`);
  }

  /** Posts as the bot. Only the listed users are pinged, never @everyone or roles. */
  post(channelId: string, content: string, pingUserIds: string[] = []) {
    return this.bot<{ id: string }>(`/channels/${channelId}/messages`, {
      method: "POST",
      body: { content, allowed_mentions: { parse: [], users: pingUserIds } },
    });
  }

  /** Who a member's OAuth access token belongs to. */
  me(accessToken: string) {
    return this.request<DiscordUser>("/users/@me", `Bearer ${accessToken}`);
  }

  /** Swaps the Activity's OAuth code for an access token. */
  async exchangeCode(code: string, clientId: string, clientSecret: string): Promise<string> {
    const response = await this.fetch(`${this.base}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
      }),
    });
    if (!response.ok) throw new DiscordError(response.status, "Discord refused the sign-in code");
    const { access_token } = (await response.json()) as { access_token: string };
    return access_token;
  }

  private bot<T>(path: string, init?: { method: string; body: unknown }) {
    return this.request<T>(path, `Bot ${this.options.botToken}`, init);
  }

  private async request<T>(
    path: string,
    authorization: string,
    init?: { method: string; body: unknown },
    retried = false,
  ): Promise<T> {
    const response = await this.fetch(`${this.base}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        authorization,
        ...(init ? { "content-type": "application/json" } : {}),
      },
      body: init ? JSON.stringify(init.body) : undefined,
    });
    if (response.status === 429 && !retried) {
      // Rate limited: wait as long as Discord asks (capped), then try once more.
      const { retry_after } = (await response.json().catch(() => ({}))) as { retry_after?: number };
      await new Promise((r) => setTimeout(r, Math.min(Number(retry_after ?? 1), 10) * 1000));
      return this.request(path, authorization, init, true);
    }
    if (!response.ok)
      throw new DiscordError(
        response.status,
        `Discord ${response.status} on ${path.split("/")[1]}`,
      );
    return (await response.json()) as T;
  }
}
