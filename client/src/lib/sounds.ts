import type { MyStatusKind } from "@studyroom/core";

/**
 * The moments a member's own session changes get a chime (played by
 * uiSounds.ts), and the shared audio context every app sound plays through.
 */
export type SoundCue = "focusStart" | "focusEnd" | "breakStart" | "breakEnd";

type Phase = "idle" | "focus" | "break";

export function phaseOf(status: MyStatusKind): Phase {
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

/** Effects, chimes and the badge and boss moments play at this share of full volume. The study music and ambience (audioChannel.ts) skip it. */
const MASTER_VOLUME = 0.5;

const outputs = new WeakMap<AudioContext, AudioNode>();

/** Where every app sound connects: one shared volume in front of the speakers. */
export function output(ctx: AudioContext): AudioNode {
  let out = outputs.get(ctx);
  if (!out) {
    const gain = ctx.createGain();
    gain.gain.value = MASTER_VOLUME;
    gain.connect(ctx.destination);
    out = gain;
    outputs.set(ctx, out);
  }
  return out;
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
    source.connect(output(ctx));
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

/** "tick" counts down; "lastTick" is the final second, a little louder. */
export type Chirp = "tick" | "lastTick";
