import crackle from "../assets/sfx/crackle.mp3";
import lightning from "../assets/sfx/lightning.mp3";
import spotlight from "../assets/sfx/spotlight.mp3";
import tension from "../assets/sfx/tension.mp3";
import thud from "../assets/sfx/thud.mp3";
import whoosh from "../assets/sfx/whoosh.mp3";
import { playSound, type Clip } from "./clips";
import { scheduleFanfare, type Fanfare } from "./eventSounds";
import { withAudio } from "./sounds";
import { SHOWS } from "./unlockShow";

/**
 * Quiet recorded effects under each show's music, on its actions: a thud when
 * a medal lands, whooshes as it moves, a spotlight and tension for gold,
 * crackle and a lightning strike in the platinum beam, and a heavy thud as the
 * boss card breaks. The secret stars and the boss rumble stay synthesised. Timings follow
 * lib/unlockShow.ts. Credits are in CREDITS.md.
 */

/** All effects sit well under the music. */
const VOLUME = 0.5;

/** The whoosh peaks this far in, so it is started early to peak on its action. */
const WHOOSH_PEAK = 0.85;

type Cue = { url: string; at: number; volume?: number };

const swoosh = (peak: number, volume?: number): Cue => ({
  url: whoosh,
  at: Math.max(0, peak - WHOOSH_PEAK),
  volume,
});

export const SHOW_EFFECTS: Record<Clip, Cue[]> = {
  bronze: [{ url: thud, at: SHOWS.bronze.land }],
  // Light gathers into the middle, then the medal appears on the hit.
  silver: [swoosh(SHOWS.silver.land), { url: thud, at: SHOWS.silver.land }],
  // The spotlight snaps on, then the medal spins up into it, swishing as it turns.
  gold: [
    { url: spotlight, at: 0, volume: 0.7 },
    { url: tension, at: 0.1, volume: 0.8 },
    ...[2, 3].map((k) => swoosh(SHOWS.gold.land * Math.sqrt((k + 0.5) / 4), 0.6)),
    { url: thud, at: SHOWS.gold.land },
  ],
  // The beam crackles as the medal comes down it, then lightning strikes.
  platinum: [
    { url: crackle, at: 1, volume: 0.6 },
    { url: lightning, at: 5.3 },
    { url: thud, at: SHOWS.platinum.land },
  ],
  // The stars collapse into the gem.
  secret: [swoosh(SHOWS.secret.land - 0.05), { url: thud, at: SHOWS.secret.land }],
  // The card breaks with a heavy thud, and the slayer medal rises.
  boss: [
    { url: thud, at: 2.45 },
    { url: whoosh, at: 2.45, volume: 0.6 },
  ],
};

/** Every effect file, to load ahead of time. */
export const SHOW_SOUNDS = [crackle, lightning, spotlight, tension, thud, whoosh];

/** Synth parts: the secret stars lighting one by one, and the boss card's rumble. */
const SYNTH: Partial<Record<Clip, Fanfare>> = {
  secret: {
    tones: Array.from({ length: 9 }, (_, i) => ({
      freq: [2093, 2349, 2637, 3136, 3520][i % 5]! * (i % 2 ? 1 : 1.5),
      at: 0.25 + (i * 4.5) / 9,
      length: 0.6,
      wave: "sine" as const,
      volume: 0.4,
    })),
    reverb: 1.6,
    volume: 0.5,
  },
  boss: {
    tones: [],
    noises: [{ at: 0.2, length: 2.3, volume: 0.6, from: 70, to: 140 }],
    reverb: 1.2,
    volume: 0.4,
  },
};

/** Plays a show's effects, and returns a function that fades them out. */
export function playShowEffects(show: Clip): () => void {
  const stops = SHOW_EFFECTS[show].map((cue) =>
    playSound(cue.url, VOLUME * (cue.volume ?? 1), cue.at),
  );
  const synth = SYNTH[show];
  if (synth) {
    withAudio((ctx) => {
      const out = scheduleFanfare(ctx, synth);
      stops.push(() => out.gain.setTargetAtTime(0, ctx.currentTime, 0.1));
    });
  }
  return () => {
    for (const stop of stops) {
      try {
        stop();
      } catch {
        // Already stopped.
      }
    }
  };
}
