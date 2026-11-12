import { afterEach, describe, expect, it, vi } from "vitest";

/** Just enough of Web Audio to decode and start a clip. */
class FakeAudioContext {
  static sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  state = "running";
  currentTime = 0;
  destination = {};
  decodeAudioData = vi.fn(async () => ({ duration: 8 }));
  createGain = () => ({
    gain: { value: 1, setTargetAtTime: vi.fn() },
    connect: (next: unknown) => next,
  });
  createBufferSource = () => {
    const source = {
      buffer: null,
      connect: (next: unknown) => next,
      start: vi.fn(),
      stop: vi.fn(),
    };
    FakeAudioContext.sources.push(source);
    return source;
  };
}

async function setup() {
  FakeAudioContext.sources = [];
  vi.stubGlobal("AudioContext", FakeAudioContext);
  const fetch = vi.fn(async () => new Response(new ArrayBuffer(8)));
  vi.stubGlobal("fetch", fetch);
  vi.resetModules();
  const clips = await import("../src/lib/clips");
  const events = await import("../src/lib/eventSounds");
  return { ...clips, ...events, fetch };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recorded clips", () => {
  it("load once and play from where the show is", async () => {
    const { playClip, CLIPS, fetch } = await setup();
    playClip("gold");
    playClip("gold");
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(CLIPS.gold.url);
    expect(FakeAudioContext.sources).toHaveLength(2);
    const [when, offset] = FakeAudioContext.sources[0]!.start.mock.calls[0]!;
    expect(when).toBe(0);
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(offset).toBeLessThan(1);
  });

  it("can be stopped before or after they start", async () => {
    const { playClip } = await setup();
    playClip("silver")();
    await settle();
    expect(FakeAudioContext.sources).toHaveLength(0);

    const stop = playClip("silver");
    await settle();
    stop();
    expect(FakeAudioContext.sources[0]!.stop).toHaveBeenCalled();
  });

  it("are the boss defeated sound, with its glass and whoosh effects", async () => {
    const { playEventSound, CLIPS, fetch } = await setup();
    playEventSound("bossDefeat");
    await settle();
    expect(fetch).toHaveBeenCalledWith(CLIPS.boss.url);
    expect(FakeAudioContext.sources).toHaveLength(3);
  });

  it("start a sound effect later when it is timed to an action", async () => {
    const { playSound } = await setup();
    playSound("/thud.mp3", 0.3, 2);
    await settle();
    const [when, offset] = FakeAudioContext.sources[0]!.start.mock.calls[0]!;
    expect(when).toBeGreaterThan(1.9);
    expect(offset).toBe(0);
  });

  it("stay quiet when loading fails, and try again next time", async () => {
    const { playClip, fetch } = await setup();
    fetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    playClip("bronze");
    await settle();
    expect(FakeAudioContext.sources).toHaveLength(0);
    playClip("bronze");
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(FakeAudioContext.sources).toHaveLength(1);
  });

  it("do nothing without Web Audio", async () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.resetModules();
    const { playClip } = await import("../src/lib/clips");
    expect(() => playClip("secret")()).not.toThrow();
  });
});
