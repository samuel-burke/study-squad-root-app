import breakEnd from "../assets/ui/break-end.mp3";
import breakStart from "../assets/ui/break-start.mp3";
import focusComplete from "../assets/ui/focus-complete.mp3";
import focusStart from "../assets/ui/focus-start.mp3";
import timerTick from "../assets/ui/timer-tick.mp3";
import { playSound } from "./clips";
import type { Chirp, SoundCue } from "./sounds";

/**
 * Recorded chimes for your own session changing, and the countdown tick
 * (Study Squad Audio Pack, CC0: see CREDITS.md). Volumes are the pack's
 * suggested mix, under the shared effects volume.
 */
export const UI_SOUNDS: Record<SoundCue | Chirp, { url: string; volume: number }> = {
  focusStart: { url: focusStart, volume: 0.72 },
  focusEnd: { url: focusComplete, volume: 0.76 },
  breakStart: { url: breakStart, volume: 0.68 },
  breakEnd: { url: breakEnd, volume: 0.72 },
  tick: { url: timerTick, volume: 0.38 },
  lastTick: { url: timerTick, volume: 0.5 },
};

/** Plays a session chime or countdown tick. Any audio failure is swallowed. */
export function playUiSound(sound: SoundCue | Chirp): void {
  const { url, volume } = UI_SOUNDS[sound];
  playSound(url, volume);
}
