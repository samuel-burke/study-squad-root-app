import cafe from "../assets/ambient/cafe.mp3";
import fireplace from "../assets/ambient/fireplace.mp3";
import forest from "../assets/ambient/forest.mp3";
import rain from "../assets/ambient/rain.mp3";
import storm from "../assets/ambient/storm.mp3";

/** Ambience ships with the app (CC0, see assets/ambient/CREDITS.md). */
export const AMBIENCE = { rain, storm, cafe, fireplace, forest } as const;
export type Ambience = keyof typeof AMBIENCE | "off";

/**
 * The CC0 music library lives on its own site so it can grow without app
 * releases. tracks.json lists every track; see the study-squad-music repo.
 */
export const MUSIC_BASE_URL = "https://samuel-burke.github.io/study-squad-music/";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  /** Path relative to MUSIC_BASE_URL. */
  file: string;
  /** Length in seconds. */
  seconds: number;
}

function isTrack(t: unknown): t is Track {
  const x = t as Track;
  return (
    !!x &&
    typeof x.id === "string" &&
    typeof x.title === "string" &&
    typeof x.artist === "string" &&
    typeof x.album === "string" &&
    typeof x.genre === "string" &&
    typeof x.file === "string" &&
    typeof x.seconds === "number"
  );
}

/** Loads the track list. Bad entries are dropped; a failure gives an empty list. */
export async function fetchTracks(base = MUSIC_BASE_URL): Promise<Track[]> {
  try {
    const res = await fetch(`${base}tracks.json`);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? data.filter(isTrack) : [];
  } catch {
    return [];
  }
}

export function trackUrl(track: Track, base = MUSIC_BASE_URL): string {
  return new URL(track.file, base).href;
}
