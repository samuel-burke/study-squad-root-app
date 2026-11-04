import { useEffect } from "react";
import { playChirp, type Chirp } from "../lib/sounds";

/** Seconds before a phase change that get a chirp: one early warning, then the last five. */
export const CHIRP_SECONDS = [60, 5, 4, 3, 2, 1] as const;

/** Longest wait between clock checks, so a stalled or late timer is caught within a second. */
const MAX_WAIT_MS = 1_000;

/** A chirp this late is skipped instead of played off the clock. */
const LATE_MS = 750;

/**
 * Chirps as your focus or break runs out: once at 1 minute left, then every
 * second for the last 5.
 *
 * The chirps are read off the same server clock and end time the countdown
 * shows. Rather than one long timer per chirp (which browsers delay in the
 * background, and which stops while a laptop sleeps, so it slowly falls
 * behind the clock), the hook checks the clock at least once a second and
 * plays each chirp when the clock reaches it. A chirp that is already too late
 * (say, opening the app with 3 seconds left, or waking the device) is skipped,
 * not played late.
 */
export function useCountdownChirps(
  endsAt: number | null,
  now: () => number,
  muted: boolean,
  play: (chirp: Chirp) => void = playChirp,
): void {
  useEffect(() => {
    if (endsAt === null || muted) return;
    // Chirps still ahead of us, soonest last so pop() takes the next one.
    const pending = CHIRP_SECONDS.filter((s) => s * 1000 <= endsAt - now()).reverse();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      const left = endsAt - now();
      while (pending.length > 0 && left <= pending[pending.length - 1]! * 1000) {
        const s = pending.pop()!;
        if (s * 1000 - left >= LATE_MS) continue;
        try {
          play(s === 1 ? "lastTick" : "tick");
        } catch {
          // A chirp must never break the room screen.
        }
      }
      if (pending.length === 0) return;
      const untilNext = left - pending[pending.length - 1]! * 1000;
      timer = setTimeout(check, Math.min(MAX_WAIT_MS, untilNext));
    };

    // Coming back to the app, catch up at once instead of on a throttled timer.
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      pending.length = 0;
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [endsAt, now, muted, play]);
}
