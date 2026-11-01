import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A stand-in for the Web Audio API that records what gets scheduled. */
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = "suspended";
  currentTime = 10;
  destination = {};
  oscillators: { type: string; frequency: { value: number }; start: ReturnType<typeof vi.fn> }[] =
    [];
  resume = vi.fn(() => {
    this.state = "running";
    return Promise.resolve();
  });

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createOscillator() {
    const osc = {
      type: "",
      frequency: { value: 0 },
      connect: (node: unknown) => node,
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.oscillators.push(osc);
    return osc;
  }

  sources: { start: ReturnType<typeof vi.fn> }[] = [];
  createBuffer = vi.fn(() => ({}));
  createBufferSource() {
    const source = { buffer: null, connect: vi.fn(), start: vi.fn() };
    this.sources.push(source);
    return source;
  }

  createGain() {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: (node: unknown) => node,
    };
  }
}

// The module caches its AudioContext, so load a fresh copy for every test.
async function loadSounds() {
  vi.resetModules();
  return import("../src/lib/sounds");
}

beforeEach(() => {
  FakeAudioContext.instances = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("playCue", () => {
  it("schedules one note per pitch of the chime", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const { playCue } = await loadSounds();
    playCue("focusStart");
    const ctx = FakeAudioContext.instances[0]!;
    expect(ctx.oscillators.map((o) => o.frequency.value)).toEqual([523.25, 659.25, 783.99]);
    expect(ctx.oscillators[0]!.start).toHaveBeenCalledWith(10.02);
    expect(ctx.resume).toHaveBeenCalled();
  });

  it("reuses one audio context across chimes", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const { playCue } = await loadSounds();
    playCue("breakStart");
    playCue("breakEnd");
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0]!.oscillators).toHaveLength(5);
  });

  it("falls back to the prefixed webkitAudioContext", async () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", FakeAudioContext);
    const { playCue } = await loadSounds();
    playCue("focusEnd");
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it("does nothing when the browser has no Web Audio", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const { playCue, unlockAudio } = await loadSounds();
    expect(() => playCue("focusStart")).not.toThrow();
    expect(() => unlockAudio()).not.toThrow();
  });

  it("stays quiet when the audio context can't be created", async () => {
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("NotAllowedError");
        }
      },
    );
    const { playCue } = await loadSounds();
    expect(() => playCue("focusStart")).not.toThrow();
  });

  it("stays quiet when scheduling a note fails", async () => {
    class BrokenContext extends FakeAudioContext {
      override createOscillator(): never {
        throw new Error("InvalidStateError");
      }
    }
    vi.stubGlobal("AudioContext", BrokenContext);
    const { playCue } = await loadSounds();
    expect(() => playCue("breakStart")).not.toThrow();
  });

  it("swallows a resume that rejects or throws", async () => {
    class Rejects extends FakeAudioContext {
      override resume = vi.fn(() => Promise.reject(new Error("blocked")));
    }
    vi.stubGlobal("AudioContext", Rejects);
    let sounds = await loadSounds();
    expect(() => sounds.unlockAudio()).not.toThrow();
    await Promise.resolve();

    class Throws extends FakeAudioContext {
      override resume = vi.fn((): Promise<void> => {
        throw new Error("blocked");
      });
    }
    vi.stubGlobal("AudioContext", Throws);
    sounds = await loadSounds();
    expect(() => sounds.unlockAudio()).not.toThrow();
    expect(() => sounds.playCue("focusStart")).not.toThrow();
  });

  it("does not resume a context that is already running", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const { unlockAudio } = await loadSounds();
    unlockAudio();
    unlockAudio();
    expect(FakeAudioContext.instances[0]!.resume).toHaveBeenCalledTimes(1);
  });

  it("plays one silent sample on the first unlock, as iOS needs", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const { unlockAudio } = await loadSounds();
    unlockAudio();
    unlockAudio();
    const ctx = FakeAudioContext.instances[0]!;
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0]!.start).toHaveBeenCalledWith(0);
  });

  it("tries the silent sample again if it failed", async () => {
    let fail = true;
    class Flaky extends FakeAudioContext {
      override createBufferSource() {
        if (fail) throw new Error("not yet");
        return super.createBufferSource();
      }
    }
    vi.stubGlobal("AudioContext", Flaky);
    const { unlockAudio } = await loadSounds();
    expect(() => unlockAudio()).not.toThrow();
    fail = false;
    unlockAudio();
    expect(FakeAudioContext.instances[0]!.sources).toHaveLength(1);
  });

  it("resumes a context Safari interrupted", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const { unlockAudio } = await loadSounds();
    unlockAudio();
    const ctx = FakeAudioContext.instances[0]!;
    (ctx as { state: string }).state = "interrupted";
    unlockAudio();
    expect(ctx.resume).toHaveBeenCalledTimes(2);
  });

  it("starts a fresh context when the old one was closed", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const { playCue } = await loadSounds();
    playCue("focusStart");
    FakeAudioContext.instances[0]!.state = "closed";
    playCue("focusStart");
    expect(FakeAudioContext.instances).toHaveLength(2);
    expect(FakeAudioContext.instances[1]!.oscillators).toHaveLength(3);
  });

  it("plays a short chirp, higher on the last second", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const { playChirp } = await loadSounds();
    playChirp("tick");
    playChirp("lastTick");
    const ctx = FakeAudioContext.instances[0]!;
    expect(ctx.oscillators.map((o) => o.frequency.value)).toEqual([1318.51, 1760]);
  });
});
