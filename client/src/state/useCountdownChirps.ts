import { useEffect } from "react";
import { playChirp, type Chirp } from "../lib/sounds";

/** Seconds before a phase change that get a chirp: one early warning, then the last five. */
export const CHIRP_SECONDS = [10, 5, 4, 3, 2, 1] as const;

/**
 * Chirps as your focus or break runs out: once at 10 seconds left, then every
 * second for the last 5. Each chirp is set on its own timer from the server
 * clock, so they land on the second instead of on the next screen refresh.
 * Chirps already in the past (say, opening the app with 3 seconds left) are
 * skipped, not played late.
 */
export function useCountdownChirps(
  endsAt: number | null,
  now: () => number,
  muted: boolean,
  play: (chirp: Chirp) => void = playChirp,
): void {
  useEffect(() => {
    if (endsAt === null || muted) return;
    const left = endsAt - now();
    const timers = CHIRP_SECONDS.filter((s) => s * 1000 <= left).map((s) =>
      setTimeout(
        () => {
          try {
            play(s === 1 ? "lastTick" : "tick");
          } catch {
            // A chirp must never break the room screen.
          }
        },
        left - s * 1000,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [endsAt, now, muted, play]);
}
