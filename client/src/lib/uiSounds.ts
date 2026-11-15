import breakEnd from "../assets/ui/break-end.mp3";
import breakStart from "../assets/ui/break-start.mp3";
import focusComplete from "../assets/ui/focus-complete.mp3";
import focusStart from "../assets/ui/focus-start.mp3";
import memberJoin from "../assets/ui/member-join.mp3";
import memberLeave from "../assets/ui/member-leave.mp3";
import timerFinish from "../assets/ui/timer-finish.mp3";
import timerTick from "../assets/ui/timer-tick.mp3";
import uiClick from "../assets/ui/ui-click.mp3";
import { playSound } from "./clips";
import type { Chirp, SoundCue } from "./sounds";

export type UiSound = SoundCue | Chirp | "memberJoin" | "memberLeave" | "click";

/**
 * Recorded UI sounds: your session changing, the countdown, people joining
 * and leaving the board, and button taps (Study Squad Audio Pack, CC0: see
 * CREDITS.md). Volumes are the pack's suggested mix, under the shared effects
 * volume.
 */
export const UI_SOUNDS: Record<UiSound, { url: string; volume: number }> = {
  focusStart: { url: focusStart, volume: 0.72 },
  focusEnd: { url: focusComplete, volume: 0.76 },
  breakStart: { url: breakStart, volume: 0.68 },
  breakEnd: { url: breakEnd, volume: 0.72 },
  tick: { url: timerTick, volume: 0.38 },
  // Starts a second before zero and rings out as the clock gets there.
  lastTick: { url: timerFinish, volume: 0.68 },
  memberJoin: { url: memberJoin, volume: 0.48 },
  memberLeave: { url: memberLeave, volume: 0.35 },
  click: { url: uiClick, volume: 0.3 },
};

/** Plays a UI sound. Any audio failure is swallowed. */
export function playUiSound(sound: UiSound): void {
  const { url, volume } = UI_SOUNDS[sound];
  playSound(url, volume);
}
