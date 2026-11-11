import { CLIPS, playClip } from "./clips";
import { withAudio } from "./sounds";

/**
 * Sounds for room moments: a round's celebration, the weekly boss going
 * down, and your own level-up. The celebration and level-up are synthesised
 * with Web Audio like the session chimes. The boss going down is a recorded
 * orchestral clip (see clips.ts).
 */
export type EventSound = "celebration" | "bossDefeat" | "levelUp";

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

const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880;
const C6 = 1046.5;
const E6 = 1318.51;
const G6 = 1567.98;
const C7 = 2093;

const run = (notes: number[], start: number, gap: number, length: number, volume: number) =>
  notes.map((freq, i) => ({
    freq,
    at: start + i * gap,
    length,
    wave: "triangle" as const,
    volume,
  }));

export const EVENT_SOUNDS: Record<Exclude<EventSound, "bossDefeat">, Fanfare> = {
  // A cheerful "ta-da": two quick pickups, a bright major chord and confetti sparkle.
  celebration: {
    volume: 0.15,
    reverb: 1,
    noises: [{ at: 0.22, length: 0.5, volume: 0.15, from: 5000, to: 9000 }],
    tones: [
      { freq: G5, at: 0, length: 0.1, wave: "triangle", volume: 0.7 },
      { freq: G5, at: 0.1, length: 0.1, wave: "triangle", volume: 0.7 },
      ...[C5, E5, G5, C6].map((freq) => ({
        freq,
        at: 0.22,
        length: 0.7,
        wave: "triangle" as const,
        volume: 0.5,
      })),
      ...run([E6, G6, C7], 0.3, 0.07, 0.5, 0.3),
    ],
  },
  // A fast climbing scale that lands on a sparkling held note.
  levelUp: {
    volume: 0.15,
    reverb: 1.2,
    tones: [
      ...run([C5, D5, E5, G5, A5, C6], 0, 0.06, 0.16, 0.6),
      { freq: E6, at: 0.38, length: 0.9, wave: "triangle", volume: 0.55 },
      { freq: C6, at: 0.38, length: 0.9, wave: "sine", volume: 0.45 },
      ...run([G6, C7], 0.48, 0.08, 0.5, 0.3),
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

/** Plays a room-moment sound. Any audio failure is swallowed. */
export function playEventSound(sound: EventSound): void {
  if (sound === "bossDefeat") playClip("boss");
  else withAudio((ctx) => scheduleFanfare(ctx, EVENT_SOUNDS[sound]));
}

/** Seconds from the first note to the end of the last one, not counting reverb. */
export function fanfareLength(fanfare: Fanfare): number {
  const ends = [...fanfare.tones, ...(fanfare.noises ?? [])].map((n) => n.at + n.length);
  return Math.max(0, ...ends);
}

/** Seconds a room-moment sound lasts, so the next one can wait for it. */
export function eventSoundLength(sound: EventSound): number {
  return sound === "bossDefeat" ? CLIPS.boss.seconds : fanfareLength(EVENT_SOUNDS[sound]);
}
