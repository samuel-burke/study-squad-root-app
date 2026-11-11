import type { MyStatusKind } from "@studyroom/core";
import { useEffect, useState } from "react";
import { AMBIENT_FILES, setAmbient, type Ambient } from "../lib/ambient";
import { phaseOf } from "../lib/sounds";

const SOUND_KEY = "studysquad.ambient";
const VOLUME_KEY = "studysquad.ambientVolume";
const DEFAULT_VOLUME = 40;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked. The choice then lasts until the app reloads.
  }
}

/** Background sound must never break the room screen. */
function safely(run: () => void): void {
  try {
    run();
  } catch {
    // Skip this change; the next one tries again.
  }
}

function readSound(): Ambient {
  const saved = read(SOUND_KEY);
  return saved && saved in AMBIENT_FILES ? (saved as Ambient) : "off";
}

function readVolume(): number {
  const saved = Number(read(VOLUME_KEY) ?? DEFAULT_VOLUME);
  return Number.isInteger(saved) && saved >= 0 && saved <= 100 ? saved : DEFAULT_VOLUME;
}

/**
 * Your background sound: off by default, saved per member and per device,
 * and only audible while you focus, so it fades out on breaks.
 */
export function useAmbient(
  status: MyStatusKind | null,
  apply: typeof setAmbient = setAmbient,
): {
  sound: Ambient;
  volume: number;
  setSound(sound: Ambient): void;
  setVolume(volume: number): void;
} {
  const [sound, setSoundState] = useState(readSound);
  const [volume, setVolumeState] = useState(readVolume);
  const focusing = status !== null && phaseOf(status) === "focus";

  useEffect(() => {
    safely(() => apply(sound, volume / 100, focusing));
  }, [apply, sound, volume, focusing]);

  // Fade out if the room screen goes away.
  useEffect(() => () => safely(() => apply("off", 0, false)), [apply]);

  return {
    sound,
    volume,
    setSound(next) {
      setSoundState(next);
      write(SOUND_KEY, next);
    },
    setVolume(next) {
      setVolumeState(next);
      write(VOLUME_KEY, String(next));
    },
  };
}
