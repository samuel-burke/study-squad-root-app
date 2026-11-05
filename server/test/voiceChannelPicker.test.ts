import { DomainError, ErrorCode } from "@studyroom/core";
import { describe, expect, it, vi } from "vitest";
import { VOICE_PICK_KEY, VoiceChannelPicker } from "../src/adapters/voiceChannelPicker";
import { KnexStore } from "../src/persistence/knexStore";
import { freshDatabase } from "./sqlite";

const channels = [
  { id: "text-1", name: "study-hall", voice: false },
  { id: "voice-1", name: "Study voice", voice: true },
  { id: "voice-2", name: "Quiet library", voice: true },
];

async function setup(admins: string[] = ["admin"]) {
  const db = await freshDatabase();
  const store = new KnexStore(db);
  const apply = vi.fn(async () => {});
  const make = () =>
    new VoiceChannelPicker({
      channels: async () => channels,
      canManage: async (userId) => admins.includes(userId),
      store: store.kv,
      apply,
      status: () => "#Study voice",
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
  return { db, store, apply, picker: make(), make };
}

describe("VoiceChannelPicker", () => {
  it("lists only voice channels to admins", async () => {
    const { db, picker } = await setup();
    try {
      expect(await picker.choice("admin")).toEqual({
        canEdit: true,
        selectedId: "",
        channels: [
          { id: "voice-1", name: "Study voice" },
          { id: "voice-2", name: "Quiet library" },
        ],
        status: "#Study voice",
      });
    } finally {
      await db.destroy();
    }
  });

  it("shows members the status but no channels", async () => {
    const { db, picker } = await setup();
    try {
      expect(await picker.choice("ana")).toEqual({
        canEdit: false,
        selectedId: "",
        channels: [],
        status: "#Study voice",
      });
    } finally {
      await db.destroy();
    }
  });

  it("saves a pick to SQLite, applies it, and loads it again after a restart", async () => {
    const { db, store, apply, picker, make } = await setup();
    try {
      const choice = await picker.pick("admin", "voice-2");
      expect(choice.selectedId).toBe("voice-2");
      expect(apply).toHaveBeenCalledTimes(1);
      expect(await store.kv.get(VOICE_PICK_KEY)).toBe("voice-2");
      // A new picker over the same database, as after an app reload.
      const reloaded = make();
      expect(await reloaded.picked()).toBe("voice-2");
      expect((await reloaded.choice("admin")).selectedId).toBe("voice-2");
    } finally {
      await db.destroy();
    }
  });

  it("clears the pick with an empty id", async () => {
    const { db, picker } = await setup();
    try {
      await picker.pick("admin", "voice-1");
      expect((await picker.pick("admin", "")).selectedId).toBe("");
      expect(await picker.picked()).toBe("");
    } finally {
      await db.destroy();
    }
  });

  it("refuses non-admins", async () => {
    const { db, apply, picker } = await setup();
    try {
      await expect(picker.pick("ana", "voice-1")).rejects.toMatchObject({
        code: ErrorCode.Forbidden,
      });
      expect(apply).not.toHaveBeenCalled();
      expect(await picker.picked()).toBe("");
    } finally {
      await db.destroy();
    }
  });

  it("refuses text channels and unknown ids", async () => {
    const { db, picker } = await setup();
    try {
      for (const id of ["text-1", "nope"]) {
        await expect(picker.pick("admin", id)).rejects.toBeInstanceOf(DomainError);
      }
      expect(await picker.picked()).toBe("");
    } finally {
      await db.destroy();
    }
  });

  it("treats a failed permission check as not an admin", async () => {
    const { db } = await setup();
    try {
      const picker = new VoiceChannelPicker({
        channels: async () => channels,
        canManage: async () => {
          throw new Error("NoPermissionToRead");
        },
        store: new KnexStore(db).kv,
        apply: async () => {},
        status: () => "",
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });
      expect((await picker.choice("admin")).canEdit).toBe(false);
    } finally {
      await db.destroy();
    }
  });
});
