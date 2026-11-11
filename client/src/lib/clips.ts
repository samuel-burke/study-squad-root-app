import type { BadgeTier } from "@studyroom/core";
import boss from "../assets/sounds/boss.mp3";
import bronze from "../assets/sounds/bronze.mp3";
import gold from "../assets/sounds/gold.mp3";
import platinum from "../assets/sounds/platinum.mp3";
import secret from "../assets/sounds/secret.mp3";
import silver from "../assets/sounds/silver.mp3";
import { withAudio } from "./sounds";

/**
 * Recorded music for the big moments: a clip per badge tier, timed to its
 * unlock show (see unlockShow.ts), and one for the weekly boss going down.
 * Credits and licenses are in CREDITS.md.
 */
export type Clip = BadgeTier | "boss";

export const CLIPS: Record<Clip, { url: string; seconds: number }> = {
  bronze: { url: bronze, seconds: 5 },
  silver: { url: silver, seconds: 6.5 },
  gold: { url: gold, seconds: 11.5 },
  platinum: { url: platinum, seconds: 12.2 },
  secret: { url: secret, seconds: 12.2 },
  boss: { url: boss, seconds: 15.6 },
};

/** The clips are loudness matched, and sit a little under full volume. */
const VOLUME = 0.8;

const loaded = new Map<string, Promise<AudioBuffer>>();

function load(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  let buffer = loaded.get(url);
  if (!buffer) {
    buffer = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data));
    // A failed load is tried again next time.
    buffer.catch(() => loaded.delete(url));
    loaded.set(url, buffer);
  }
  return buffer;
}

/** Loads every clip, and any `extra` sounds, ahead of time so the first one plays on the beat. */
export function preloadClips(extra: string[] = []): void {
  withAudio((ctx) => {
    for (const url of [...Object.values(CLIPS).map((c) => c.url), ...extra]) {
      void load(ctx, url).catch(() => {});
    }
  });
}

/**
 * Plays a clip, and returns a function that fades it out. If it is still
 * loading, it starts as far in as the wait was, so it stays in time with the
 * show that started alongside it. Any audio failure is swallowed.
 */
export function playClip(clip: Clip): () => void {
  return playSound(CLIPS[clip].url, VOLUME);
}

/**
 * Plays a sound `at` seconds from now at `volume`, and returns a function that
 * fades it out. A late load skips ahead so it stays in time.
 */
export function playSound(url: string, volume: number, at = 0): () => void {
  const asked = performance.now();
  let stopped = false;
  let stop = () => {
    stopped = true;
  };
  withAudio((ctx) => {
    load(ctx, url)
      .then((buffer) => {
        const late = (performance.now() - asked) / 1000 - at;
        if (stopped || late >= buffer.duration) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = volume;
        source.connect(gain).connect(ctx.destination);
        source.start(ctx.currentTime + Math.max(0, -late), Math.max(0, late));
        stop = () => {
          gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
          source.stop(ctx.currentTime + 0.8);
        };
      })
      .catch(() => {});
  });
  return () => {
    try {
      stop();
    } catch {
      // Already stopped.
    }
  };
}
