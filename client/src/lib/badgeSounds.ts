import type { BadgeTier } from "@studyroom/core";
import { withAudio } from "./sounds";

/**
 * Fanfares for unlocking a badge, from a small bronze "ding" up to a
 * platinum riser with a boom, a brass chord and bells. Like the session
 * chimes, they are synthesised with Web Audio, so there are no audio files.
 * Hits are timed to the unlock animation (see `.unlock` in styles.css).
 */

export interface Tone {
  freq: number;
  at: number;
  length: number;
  wave?: OscillatorType;
  volume?: number;
  /** Slide to this frequency over the note. */
  glideTo?: number;
  /** Lowpass cutoff for a warmer, brassier sawtooth. */
  cutoff?: number;
  /** Seconds to fade in, for pads. */
  attack?: number;
}

export interface Noise {
  at: number;
  length: number;
  volume: number;
  /** Bandpass sweep, in Hz. */
  from: number;
  to: number;
}

export interface Fanfare {
  tones: Tone[];
  noises?: Noise[];
  /** Seconds of reverb tail. 0 for none. */
  reverb: number;
  volume: number;
}

/** Equal-tempered note frequencies we use. */
const N = {
  A2: 110,
  C3: 130.81,
  G3: 196,
  C4: 261.63,
  E4: 329.63,
  G4: 392,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  Fs5: 739.99,
  G5: 783.99,
  A5: 880,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  Fs6: 1479.98,
  G6: 1567.98,
  Gs6: 1661.22,
  A6: 1760,
  As6: 1864.66,
  C7: 2093,
  E7: 2637.02,
  G7: 3135.96,
};

const bells = (notes: number[], start: number, gap: number, volume = 0.5): Tone[] =>
  notes.map((freq, i) => ({ freq, at: start + i * gap, length: 0.9, wave: "sine", volume }));

const chord = (notes: number[], at: number, length: number, extra: Partial<Tone> = {}): Tone[] =>
  notes.map((freq) => ({ freq, at, length, ...extra }));

/** A low sine that drops in pitch: the "boom" of an impact. */
const boom = (at: number, volume = 1): Tone => ({
  freq: 120,
  glideTo: 38,
  at,
  length: 0.7,
  wave: "sine",
  volume,
});

export const FANFARES: Record<BadgeTier, Fanfare> = {
  // A bright two-note ding as the medal pops.
  bronze: {
    volume: 0.16,
    reverb: 0,
    tones: [
      { freq: N.C6, at: 0.05, length: 0.25, wave: "triangle" },
      { freq: N.G6, at: 0.17, length: 0.6, wave: "triangle" },
    ],
  },
  // A rising arpeggio over a soft pad, with a little shimmer.
  silver: {
    volume: 0.15,
    reverb: 1.2,
    tones: [
      ...bells([N.C6, N.E6, N.G6, N.C7], 0.05, 0.08, 0.8),
      ...chord([N.C5, N.G5], 0.05, 1.2, { wave: "sine", volume: 0.35, attack: 0.15 }),
    ],
    noises: [{ at: 0.35, length: 0.6, volume: 0.12, from: 6000, to: 9000 }],
  },
  // A whoosh as it spins in, then an impact, a brass stab and a held chord, then bells.
  gold: {
    volume: 0.17,
    reverb: 1.8,
    noises: [
      { at: 0.1, length: 0.9, volume: 0.35, from: 400, to: 4000 },
      { at: 1.05, length: 0.9, volume: 0.25, from: 5000, to: 8000 },
    ],
    tones: [
      boom(1.05, 0.9),
      ...chord([N.C4, N.E4, N.G4, N.C5], 1.05, 0.22, {
        wave: "sawtooth",
        cutoff: 2200,
        volume: 0.45,
      }),
      ...chord([N.C4, N.E4, N.G4, N.C5, N.E5], 1.3, 1.4, {
        wave: "sawtooth",
        cutoff: 1800,
        volume: 0.4,
      }),
      ...bells([N.G6, N.C7, N.E7], 1.45, 0.1),
    ],
  },
  // A long riser up the beam of light, two booms as it lands, a big chord and a run of bells.
  platinum: {
    volume: 0.18,
    reverb: 2.8,
    noises: [
      { at: 0, length: 1.7, volume: 0.3, from: 200, to: 6000 },
      { at: 1.7, length: 1.4, volume: 0.25, from: 7000, to: 10000 },
    ],
    tones: [
      { freq: N.C3, glideTo: N.C5, at: 0, length: 1.7, wave: "sine", volume: 0.5, attack: 1.2 },
      { freq: N.G3, glideTo: N.G5, at: 0, length: 1.7, wave: "sine", volume: 0.35, attack: 1.2 },
      boom(1.7),
      boom(2.0, 0.6),
      ...chord([N.C3, N.C4, N.G4, N.C5, N.E5, N.G5], 1.7, 2.2, {
        wave: "sawtooth",
        cutoff: 2400,
        volume: 0.35,
      }),
      ...bells([N.C6, N.D6, N.E6, N.G6, N.A6, N.C7, N.E7, N.G7], 1.8, 0.07, 0.45),
    ],
  },
  // An uneasy, wobbling drone while the mystery gem shakes, a burst as it
  // cracks, a bright whole-tone run upward and a shimmering chord.
  secret: {
    volume: 0.17,
    reverb: 3,
    noises: [
      { at: 1.25, length: 0.5, volume: 0.45, from: 800, to: 9000 },
      { at: 2.0, length: 1.5, volume: 0.2, from: 6000, to: 11000 },
    ],
    tones: [
      { freq: N.A2, at: 0, length: 1.3, wave: "triangle", volume: 0.5, attack: 0.4 },
      { freq: N.A2 * 1.03, at: 0, length: 1.3, wave: "triangle", volume: 0.5, attack: 0.4 },
      { freq: N.A2 * 1.5, glideTo: N.A2 * 2, at: 0.3, length: 1.0, wave: "sine", volume: 0.3 },
      boom(1.3),
      ...bells([N.C6, N.D6, N.E6, N.Fs6, N.Gs6, N.As6, N.C7], 1.4, 0.05, 0.4),
      ...chord([N.C4, N.E4, N.B4, N.Fs5, N.A5], 1.9, 2.2, {
        wave: "sine",
        volume: 0.4,
        attack: 0.1,
      }),
      ...chord([N.C4 * 1.006, N.E4 * 1.006, N.B4 * 1.006], 1.9, 2.2, {
        wave: "triangle",
        volume: 0.25,
        attack: 0.1,
      }),
      ...bells([N.E7, N.C7, N.G6, N.E7, N.G7], 2.1, 0.13, 0.35),
    ],
  },
};

/** A decaying noise burst, used as a simple reverb impulse. */
function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
  }
  return buffer;
}

function scheduleTone(ctx: AudioContext, out: AudioNode, start: number, tone: Tone): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = tone.wave ?? "triangle";
  const t0 = start + tone.at;
  const t1 = t0 + tone.length;
  osc.frequency.setValueAtTime(tone.freq, t0);
  if (tone.glideTo) osc.frequency.exponentialRampToValueAtTime(tone.glideTo, t1);
  const peak = tone.volume ?? 1;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + (tone.attack ?? 0.015));
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);
  let node: AudioNode = osc;
  if (tone.cutoff) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = tone.cutoff;
    node = node.connect(filter);
  }
  node.connect(gain).connect(out);
  osc.start(t0);
  osc.stop(t1 + 0.05);
}

function scheduleNoise(ctx: AudioContext, out: AudioNode, start: number, noise: Noise): void {
  const source = ctx.createBufferSource();
  const length = Math.floor(ctx.sampleRate * noise.length);
  const buffer = ctx.createBuffer(1, Math.max(1, length), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  const t0 = start + noise.at;
  const t1 = t0 + noise.length;
  filter.frequency.setValueAtTime(noise.from, t0);
  filter.frequency.exponentialRampToValueAtTime(noise.to, t1);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(noise.volume, t0 + noise.length * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);
  source.connect(filter).connect(gain).connect(out);
  source.start(t0);
  source.stop(t1 + 0.05);
}

/** Schedules a fanfare on `ctx`. Exported for tests. */
export function scheduleFanfare(ctx: AudioContext, fanfare: Fanfare): void {
  const start = ctx.currentTime + 0.02;
  const master = ctx.createGain();
  master.gain.value = fanfare.volume;
  // Soften the peaks when many notes stack up.
  const limiter = ctx.createDynamicsCompressor();
  master.connect(limiter).connect(ctx.destination);
  if (fanfare.reverb > 0) {
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, fanfare.reverb);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    master.connect(reverb).connect(wet).connect(limiter);
  }
  for (const tone of fanfare.tones) scheduleTone(ctx, master, start, tone);
  for (const noise of fanfare.noises ?? []) scheduleNoise(ctx, master, start, noise);
}

/** Plays the fanfare for a badge tier. Any audio failure is swallowed. */
export function playBadgeSound(tier: BadgeTier): void {
  withAudio((ctx) => scheduleFanfare(ctx, FANFARES[tier]));
}

/** Seconds from the first note to the end of the last one, not counting reverb. */
export function fanfareLength(fanfare: Fanfare): number {
  const ends = [...fanfare.tones, ...(fanfare.noises ?? [])].map((n) => n.at + n.length);
  return Math.max(0, ...ends);
}
