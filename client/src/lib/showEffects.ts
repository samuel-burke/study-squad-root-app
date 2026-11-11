import type { Clip } from "./clips";
import { scheduleFanfare, type Fanfare, type Noise, type Tone } from "./eventSounds";
import { withAudio } from "./sounds";
import { SHOWS } from "./unlockShow";

/**
 * Quiet sound effects under each show's music, on its actions: swooshes as a
 * medal moves, a thud when it lands, crackle in the platinum beam, a spotlight
 * clunk for gold, twinkles as the secret stars light, and the boss card's
 * rumble and shatter. Synthesised, so there is nothing to load and they start
 * in time with the show. Timings follow lib/unlockShow.ts.
 */

const whoosh = (at: number, length: number, volume = 0.5, from = 300, to = 2400): Noise => ({
  at,
  length,
  volume,
  from,
  to,
});

/** A low body hit with a little noise on top. */
const thud = (at: number, volume = 1): { tones: Tone[]; noises: Noise[] } => ({
  tones: [
    { freq: 120, glideTo: 38, at, length: 0.5, wave: "sine", volume: 0.9 * volume, attack: 0.005 },
  ],
  noises: [{ at: at - 0.03, length: 0.09, volume: 0.25 * volume, from: 900, to: 200 }],
});

/** Electric crackle: a run of tiny bright bursts. */
const crackle = (from: number, to: number, every: number, volume: number): Noise[] => {
  const bursts: Noise[] = [];
  for (let at = from, i = 0; at < to; at += every, i++) {
    // A fixed scatter, so every unlock sounds the same.
    const jitter = ((i * 37) % 11) / 11;
    bursts.push({
      at: at + jitter * every * 0.6,
      length: 0.03 + jitter * 0.04,
      volume,
      from: 3000 + jitter * 3000,
      to: 7000,
    });
  }
  return bursts;
};

/** Glass breaking: bright bursts and small pings over a fraction of a second. */
const shatter = (at: number): { tones: Tone[]; noises: Noise[] } => ({
  noises: [
    { at: at - 0.04, length: 0.12, volume: 0.6, from: 6000, to: 2500 },
    ...crackle(at + 0.03, at + 0.5, 0.045, 0.3),
  ],
  tones: [3520, 4186, 2960, 3951, 4699].map((freq, i) => ({
    freq,
    at: at + 0.02 + i * 0.07,
    length: 0.35,
    wave: "sine" as const,
    volume: 0.12,
  })),
});

const merge = (...parts: { tones?: Tone[]; noises?: Noise[] }[]) => ({
  tones: parts.flatMap((p) => p.tones ?? []),
  noises: parts.flatMap((p) => p.noises ?? []),
});

/**
 * The medal rising from below makes two full turns, faster and faster, and
 * swishes each time it passes edge on (see `subject`, the herald build).
 */
const spins = (land: number) =>
  [0, 1, 2, 3].map((k) => whoosh(land * Math.sqrt((k + 0.5) / 4) - 0.18, 0.26, 0.3 + k * 0.08));

/** The secret constellation's stars light one by one (see `constellation`). */
const stars = Array.from({ length: 9 }, (_, i) => ({
  freq: [2093, 2349, 2637, 3136, 3520][i % 5]! * (i % 2 ? 1 : 1.5),
  at: 0.25 + (i * 4.5) / 9,
  length: 0.6,
  wave: "sine" as const,
  volume: 0.12,
}));

export const SHOW_EFFECTS: Record<Clip, Fanfare> = {
  bronze: { ...merge(thud(0.06, 0.8)), reverb: 0.6, volume: 0.35 },
  silver: {
    // Light gathers into the middle, then the medal appears on the hit.
    ...merge(
      { noises: [whoosh(SHOWS.silver.land - 1.7, 1.75, 0.45, 200, 3000)] },
      thud(SHOWS.silver.land),
    ),
    reverb: 0.8,
    volume: 0.25,
  },
  gold: {
    ...merge(
      // The spotlight snaps on, then the medal spins up into it.
      {
        noises: [{ at: 0, length: 0.05, volume: 0.5, from: 2500, to: 1200 }],
        tones: [{ freq: 70, at: 0, length: 1.2, wave: "sine", volume: 0.25, attack: 0.01 }],
      },
      { noises: spins(SHOWS.gold.land) },
      thud(SHOWS.gold.land),
    ),
    reverb: 1,
    volume: 0.25,
  },
  platinum: {
    ...merge(
      // The beam hums and crackles harder as the medal comes down it.
      {
        tones: [
          {
            freq: 55,
            glideTo: 110,
            at: 0.8,
            length: 5.2,
            wave: "sawtooth",
            cutoff: 300,
            volume: 0.12,
            attack: 1.5,
          },
        ],
        noises: [...crackle(1, 4, 0.33, 0.12), ...crackle(4, 5.6, 0.12, 0.2)],
      },
      // The lightning strike as the beam snaps narrow, then the hit.
      { noises: [{ at: 5.55, length: 0.08, volume: 0.6, from: 5000, to: 1500 }] },
      thud(6, 1.2),
    ),
    reverb: 1.4,
    volume: 0.25,
  },
  secret: {
    ...merge(
      { tones: stars },
      // The stars collapse into the gem.
      { noises: [whoosh(5.5, 0.55, 0.45, 2500, 400)] },
      thud(6, 1.2),
    ),
    reverb: 1.6,
    volume: 0.25,
  },
  boss: {
    ...merge(
      // The card shakes harder as its HP drains.
      { noises: [{ at: 0.2, length: 2.3, volume: 0.6, from: 70, to: 140 }] },
      shatter(2.5),
      // The trophy rises.
      { noises: [whoosh(2.75, 0.8, 0.35, 400, 2000)] },
    ),
    reverb: 1.2,
    volume: 0.25,
  },
};

/** Plays a show's effects, and returns a function that fades them out. */
export function playShowEffects(show: Clip): () => void {
  let stop = () => {};
  withAudio((ctx) => {
    const out = scheduleFanfare(ctx, SHOW_EFFECTS[show]);
    stop = () => out.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  });
  return () => {
    try {
      stop();
    } catch {
      // Already stopped.
    }
  };
}
