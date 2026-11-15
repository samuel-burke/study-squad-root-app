import { useEffect, useRef } from "react";
import { playUiSound, type UiSound } from "../lib/uiSounds";

/** The sound for the board going from `prev` to `next` members, not counting you. One sound per change, joins first. */
export function memberSoundFor(
  prev: readonly string[],
  next: readonly string[],
  youId: string | null,
): UiSound | null {
  const others = (ids: readonly string[]) => new Set(ids.filter((id) => id !== youId));
  const before = others(prev);
  const after = others(next);
  if ([...after].some((id) => !before.has(id))) return "memberJoin";
  if ([...before].some((id) => !after.has(id))) return "memberLeave";
  return null;
}

/**
 * A soft sound when someone else joins or leaves the board. Nothing for the
 * board the app opened with, or while muted.
 */
export function useMemberSounds(
  memberIds: readonly string[] | null,
  youId: string | null,
  muted: boolean,
  play: (sound: UiSound) => void = playUiSound,
): void {
  const previous = useRef<readonly string[] | null>(null);
  const key = memberIds?.join(",") ?? null;

  useEffect(() => {
    const prev = previous.current;
    previous.current = memberIds;
    if (!prev || !memberIds || muted) return;
    const sound = memberSoundFor(prev, memberIds, youId);
    if (!sound) return;
    try {
      play(sound);
    } catch {
      // A sound must never break the room screen.
    }
    // The ids are compared by `key`, so a new array with the same people does nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, youId, muted, play]);
}
