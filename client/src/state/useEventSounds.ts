import { useEffect, useRef } from "react";
import { eventSoundLength, playEventSound, type EventSound } from "../lib/eventSounds";

/** The parts of room state that can set off a room-moment sound. */
export interface EventSoundState {
  /** When the current celebration started, or null when none is showing. */
  celebrationAt: number | null;
  /** Identifies this week's boss, so a new boss isn't read as a defeat. */
  bossKey: string;
  bossDefeated: boolean;
  level: number;
}

/** Which sounds a change from `prev` to `next` calls for, in the order to play them. */
export function eventSoundsFor(prev: EventSoundState, next: EventSoundState): EventSound[] {
  const sounds: EventSound[] = [];
  if (next.celebrationAt !== null && next.celebrationAt !== prev.celebrationAt) {
    sounds.push("celebration");
  }
  if (next.bossDefeated && !prev.bossDefeated && next.bossKey === prev.bossKey) {
    sounds.push("bossDefeat");
  }
  if (next.level > prev.level) sounds.push("levelUp");
  return sounds;
}

/** A short gap so back-to-back sounds don't run into each other. */
const GAP_MS = 150;

/**
 * Plays a sound for a round's celebration, the boss going down and your own
 * level-up. Several at once (a round can do all three) play one after another.
 * Nothing plays for the state the app opened with, or while muted.
 */
export function useEventSounds(
  state: EventSoundState | null,
  muted: boolean,
  play: (sound: EventSound) => void = playEventSound,
): void {
  const previous = useRef<EventSoundState | null>(null);
  const busyUntil = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const prev = previous.current;
    previous.current = state;
    if (!prev || !state || muted) return;
    for (const sound of eventSoundsFor(prev, state)) {
      const now = Date.now();
      const startAt = Math.max(now, busyUntil.current);
      busyUntil.current = startAt + eventSoundLength(sound) * 1000 + GAP_MS;
      const fire = () => {
        try {
          play(sound);
        } catch {
          // A sound must never break the room screen.
        }
      };
      if (startAt === now) fire();
      else timers.current.push(setTimeout(fire, startAt - now));
    }
  }, [state, muted, play]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
}
