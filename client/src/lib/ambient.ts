import cafe from "../assets/ambient/cafe.mp3";
import lofi1 from "../assets/ambient/lofi-1.mp3";
import lofi2 from "../assets/ambient/lofi-2.mp3";
import lofi3 from "../assets/ambient/lofi-3.mp3";
import rain from "../assets/ambient/rain.mp3";
import { withAudio } from "./sounds";

/**
 * Background sound while you focus. The files are CC0 and ship with the app
 * (see assets/ambient/CREDITS.md), so playing them makes no outside requests.
 */
export type Ambient = "off" | "rain" | "cafe" | "lofi";

/** Rain and café loop one file; lo-fi plays its tracks in order, then repeats. */
export const AMBIENT_FILES: Record<Exclude<Ambient, "off">, string[]> = {
  rain: [rain],
  cafe: [cafe],
  lofi: [lofi1, lofi2, lofi3],
};

const FADE_SECONDS = 2;
const NUDGE_SECONDS = 0.15;

let audio: HTMLAudioElement | null = null;
let gain: GainNode | null = null;
let sound: Ambient = "off";
let track = 0;
let audible = false;
let pauseTimer: ReturnType<typeof setTimeout> | undefined;

function load(next: Ambient, el: HTMLAudioElement): void {
  if (next === sound || next === "off") return;
  sound = next;
  track = 0;
  const files = AMBIENT_FILES[next];
  el.loop = files.length === 1;
  el.src = files[0]!;
}

/**
 * Plays `next` at `volume` (0 to 1) when `playing`, fading in and out over two
 * seconds. The audio goes through a gain node because iPhones ignore an audio
 * element's own volume. Any audio failure is swallowed.
 */
export function setAmbient(next: Ambient, volume: number, playing: boolean): void {
  const on = playing && next !== "off" && volume > 0;
  if (!on && !audio) return;
  withAudio((ctx) => {
    if (!audio || !gain) {
      audio = new Audio();
      audio.addEventListener("ended", () => {
        const files = sound === "off" ? [] : AMBIENT_FILES[sound];
        if (!audio || files.length < 2) return;
        track = (track + 1) % files.length;
        audio.src = files[track]!;
        void audio.play().catch(() => {});
      });
      gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(audio).connect(gain).connect(ctx.destination);
    }
    const el = audio;
    const now = ctx.currentTime;
    // A new sound starts from silence; a volume change just nudges.
    const swap = on && next !== sound;
    const ramp = swap || on !== audible ? FADE_SECONDS : NUDGE_SECONDS;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(swap ? 0 : gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(on ? volume : 0, now + ramp);
    clearTimeout(pauseTimer);
    if (on) {
      if (swap) load(next, el);
      void el.play().catch(() => {});
    } else {
      // Pause once the fade ends, so a break doesn't keep decoding audio.
      pauseTimer = setTimeout(() => el.pause(), FADE_SECONDS * 1000);
    }
    audible = on;
  });
}
