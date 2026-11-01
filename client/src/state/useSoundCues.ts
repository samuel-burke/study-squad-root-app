import type { MyStatusKind } from "@studyroom/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { cueFor, playCue, unlockAudio, type SoundCue } from "../lib/sounds";

const MUTED_KEY = "studysquad.soundsMuted";

const UNLOCK_EVENTS = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
  } catch {
    // Storage can be blocked. The choice then lasts until the app reloads.
  }
}

/**
 * Plays a chime when your own focus or break starts or ends. The mute choice
 * is per member and per device, kept in local storage.
 */
export function useSoundCues(
  status: MyStatusKind | null,
  play: (cue: SoundCue) => void = playCue,
): { muted: boolean; setMuted(muted: boolean): void } {
  const [muted, setMutedState] = useState(readMuted);
  const previous = useRef<MyStatusKind | null>(null);

  // Audio stays locked until an interaction, and Safari only counts some
  // events (a touch's pointerdown isn't one). Unlock on every kind, every
  // time, since Safari can lock audio again after a call or an app switch.
  useEffect(() => {
    const unlock = () => unlockAudio();
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, true);
    return () => {
      for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true);
    };
  }, []);

  useEffect(() => {
    const prev = previous.current;
    previous.current = status;
    // No chime for the status you already had when the app opened.
    if (prev === null || status === null || muted) return;
    const cue = cueFor(prev, status);
    if (!cue) return;
    try {
      play(cue);
    } catch {
      // A chime must never break the room screen.
    }
  }, [status, muted, play]);

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    writeMuted(next);
    if (!next) unlockAudio();
  }, []);

  return { muted, setMuted };
}
