import type { MyStatusKind } from "@studyroom/core";

/**
 * Short chimes for the moments a member's own session changes. They are
 * synthesised with the Web Audio API, so the app ships no audio files and
 * there is nothing to license.
 */
export type SoundCue = "focusStart" | "focusEnd" | "breakStart" | "breakEnd";

type Phase = "idle" | "focus" | "break";

function phaseOf(status: MyStatusKind): Phase {
  switch (status) {
    case "idle":
      return "idle";
    case "roomFocus":
    case "soloFocus":
      return "focus";
    case "roomBreak":
    case "soloBreak":
      return "break";
  }
}

/**
 * Which chime to play when your status moves from `prev` to `next`.
 * Focus ending straight into a break plays the break chime only, and a break
 * rolling into the next round plays the focus chime only.
 */
export function cueFor(prev: MyStatusKind, next: MyStatusKind): SoundCue | null {
  const from = phaseOf(prev);
  const to = phaseOf(next);
  if (from === to) return null;
  if (to === "focus") return "focusStart";
  if (to === "break") return "breakStart";
  return from === "focus" ? "focusEnd" : "breakEnd";
}

interface Note {
  /** Frequency in Hz. */
  freq: number;
  /** Start offset in seconds. */
  at: number;
  /** Length in seconds. */
  length: number;
}

// Rising notes say "go", falling notes say "ease off".
const MELODIES: Record<SoundCue, { notes: Note[]; wave: OscillatorType }> = {
  // C5 E5 G5: a bright upward arpeggio.
  focusStart: {
    wave: "triangle",
    notes: [
      { freq: 523.25, at: 0, length: 0.18 },
      { freq: 659.25, at: 0.12, length: 0.18 },
      { freq: 783.99, at: 0.24, length: 0.4 },
    ],
  },
  // G5 C5: a short "done" drop.
  focusEnd: {
    wave: "triangle",
    notes: [
      { freq: 783.99, at: 0, length: 0.2 },
      { freq: 523.25, at: 0.16, length: 0.45 },
    ],
  },
  // E5 C5 A4: a soft, slow descent into the break.
  breakStart: {
    wave: "sine",
    notes: [
      { freq: 659.25, at: 0, length: 0.35 },
      { freq: 523.25, at: 0.22, length: 0.35 },
      { freq: 440, at: 0.44, length: 0.7 },
    ],
  },
  // A4 E5: a gentle nudge that the break is over.
  breakEnd: {
    wave: "sine",
    notes: [
      { freq: 440, at: 0, length: 0.25 },
      { freq: 659.25, at: 0.18, length: 0.5 },
    ],
  },
};

const VOLUME = 0.18;

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

let context: AudioContext | null = null;
let primed = false;

function getContext(): AudioContext | null {
  // A closed context can never play again, so start a fresh one.
  if (context && context.state !== "closed") return context;
  context = null;
  primed = false;
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

/**
 * Browsers keep audio locked until the person interacts with the page, and
 * Safari only unlocks it inside the tap or click itself. Call this from every
 * interaction so later chimes, which arrive after a server round trip, are
 * allowed to play.
 */
export function unlockAudio(): void {
  const ctx = getContext();
  if (!ctx) return;
  resume(ctx);
  if (primed) return;
  // iOS only treats Web Audio as started once a sound plays during a gesture,
  // so play one silent sample.
  try {
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, 22_050);
    source.connect(ctx.destination);
    source.start(0);
    primed = true;
  } catch {
    // Try again on the next interaction.
  }
}

/** Ask a paused context to start. A refusal just means no sound yet. */
function resume(ctx: AudioContext): void {
  // Safari also uses "interrupted", after a call or switching apps.
  if (ctx.state === "running" || ctx.state === "closed") return;
  try {
    void ctx.resume().catch(() => {});
  } catch {
    // Some engines throw instead of rejecting. Either way, stay quiet.
  }
}

/**
 * Runs `schedule` against the shared audio context, if there is one. Used by
 * other sound sets (badge fanfares) so they share the context and its unlock.
 * Any audio failure is swallowed.
 */
export function withAudio(schedule: (ctx: AudioContext) => void): void {
  const ctx = getContext();
  if (!ctx) return;
  resume(ctx);
  try {
    schedule(ctx);
  } catch {
    // Nothing to recover: this sound is skipped.
  }
}

/**
 * Plays a chime. Sound is a nice-to-have, so any audio failure (no Web Audio,
 * a closed context, a blocked device) is swallowed and the app carries on.
 */
export function playCue(cue: SoundCue): void {
  const ctx = getContext();
  if (!ctx) return;
  resume(ctx);
  try {
    scheduleNotes(ctx, MELODIES[cue]);
  } catch {
    // Nothing to recover: this chime is skipped.
  }
}

function scheduleNotes(ctx: AudioContext, { notes, wave }: (typeof MELODIES)[SoundCue]): void {
  const start = ctx.currentTime + 0.02;
  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = note.freq;
    const t0 = start + note.at;
    const t1 = t0 + note.length;
    // Quick attack, smooth exponential release, so there are no clicks.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(VOLUME, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t1 + 0.05);
  }
}

/** "tick" counts down; "lastTick" is the final second, pitched up a step. */
export type Chirp = "tick" | "lastTick";

const CHIRP_FREQ: Record<Chirp, number> = { tick: 1318.51, lastTick: 1760 };

/** A short, bright blip for the countdown before a phase change. */
export function playChirp(chirp: Chirp): void {
  withAudio((ctx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = CHIRP_FREQ[chirp];
    const t0 = ctx.currentTime + 0.01;
    const t1 = t0 + 0.08;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(VOLUME * 0.8, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  });
}
