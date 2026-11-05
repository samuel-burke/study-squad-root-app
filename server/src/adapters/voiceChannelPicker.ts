import { DomainError, ErrorCode, type Logger, type VoiceChannelChoiceDto } from "@studyroom/core";
import type { ChannelInfo } from "../wiring";

/** Where the admin's pick lives in the app's own SQLite key-value table. */
export const VOICE_PICK_KEY = "voiceChannelPick";

export interface VoicePickStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface VoiceChannelPickerDeps {
  /** Every channel Study Squad can see, voice or not. */
  channels(): Promise<ChannelInfo[]>;
  /** True when the member may change app settings in this community. */
  canManage(userId: string): Promise<boolean>;
  store: VoicePickStore;
  /** Reloads the room's config with the new pick and starts using it. */
  apply(): Promise<void>;
  /** How the voice channel resolved, in words for admins. */
  status(): string;
  logger: Logger;
}

/**
 * The voice channel dropdown in the in-app Room settings. Root's own channel
 * picker setting only offers text channels, so the app lists the community's
 * voice channels itself (channelGroups.list + channels.list, keeping
 * ChannelType.Voice) and saves the admin's pick in its database.
 */
export class VoiceChannelPicker {
  constructor(private readonly deps: VoiceChannelPickerDeps) {}

  /** The saved pick, or "" when none. */
  async picked(): Promise<string> {
    const value = await this.deps.store.get<unknown>(VOICE_PICK_KEY);
    return typeof value === "string" ? value : "";
  }

  async choice(userId: string): Promise<VoiceChannelChoiceDto> {
    const canEdit = await this.canEdit(userId);
    const voices = canEdit ? await this.voiceChannels() : [];
    return {
      canEdit,
      selectedId: await this.picked(),
      channels: voices.map((c) => ({ id: c.id, name: c.name })),
      status: this.deps.status(),
    };
  }

  /** Saves an admin's pick ("" clears it) and applies it straight away. */
  async pick(userId: string, channelId: string): Promise<VoiceChannelChoiceDto> {
    if (!(await this.canEdit(userId))) {
      throw new DomainError(
        ErrorCode.Forbidden,
        "Only community admins who can manage apps can change the voice channel.",
      );
    }
    const id = typeof channelId === "string" ? channelId.trim() : "";
    if (id) {
      const voices = await this.voiceChannels();
      if (!voices.some((c) => c.id === id)) {
        throw new DomainError(
          ErrorCode.Validation,
          "That isn't a voice channel Study Squad can see. Pick one from the list.",
        );
      }
    }
    await this.deps.store.set(VOICE_PICK_KEY, id);
    this.deps.logger.info("voice channel picked", { userId, channelId: id });
    await this.deps.apply();
    return this.choice(userId);
  }

  private async voiceChannels(): Promise<ChannelInfo[]> {
    return (await this.deps.channels()).filter((c) => c.voice);
  }

  private async canEdit(userId: string): Promise<boolean> {
    try {
      return await this.deps.canManage(userId);
    } catch (error) {
      this.deps.logger.warn("could not check admin permission", { error: String(error) });
      return false;
    }
  }
}
