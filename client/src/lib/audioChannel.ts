import { withAudio } from "./sounds";

const FADE_SECONDS = 2;
const NUDGE_SECONDS = 0.15;

/**
 * One looping or playlist audio source with a fade. Music and ambience each
 * get one, so they mix. Audio goes through a gain node because iPhones ignore
 * an audio element's own volume. Audio failures are swallowed.
 */
export class AudioChannel {
  private audio: HTMLAudioElement | null = null;
  private gain: GainNode | null = null;
  private src = "";
  private audible = false;
  private pauseTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly onEnded: () => void = () => {},
    private readonly onTime: (seconds: number, duration: number) => void = () => {},
  ) {}

  /**
   * Plays `src` at `volume` (0 to 1) when `audible`, fading in and out over
   * two seconds. A new `src` starts from the beginning; the same one resumes.
   */
  set(src: string | null, volume: number, audible: boolean, loop = false): void {
    const on = audible && !!src && volume > 0;
    if (!on && !this.audio) return;
    withAudio((ctx) => {
      const el = this.audio ?? this.create(ctx);
      const gain = this.gain!;
      const swap = on && src !== this.src;
      const now = ctx.currentTime;
      const ramp = swap || on !== this.audible ? FADE_SECONDS : NUDGE_SECONDS;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(swap ? 0 : gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(on ? volume : 0, now + ramp);
      clearTimeout(this.pauseTimer);
      if (on) {
        if (swap) {
          this.src = src;
          el.src = src;
        }
        el.loop = loop;
        void el.play().catch(() => {});
      } else {
        // Pause once the fade ends, so a break doesn't keep decoding audio.
        this.pauseTimer = setTimeout(() => el.pause(), FADE_SECONDS * 1000);
      }
      this.audible = on;
    });
  }

  private create(ctx: AudioContext): HTMLAudioElement {
    const el = new Audio();
    // The music site serves CORS headers; Web Audio stays silent without them.
    el.crossOrigin = "anonymous";
    el.addEventListener("ended", () => this.onEnded());
    el.addEventListener("timeupdate", () => this.onTime(el.currentTime, el.duration || 0));
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    ctx.createMediaElementSource(el).connect(this.gain).connect(ctx.destination);
    this.audio = el;
    return el;
  }
}
