import cafe from "../assets/ambient/cafe.mp3";
import fireplace from "../assets/ambient/fireplace.mp3";
import forest from "../assets/ambient/forest.mp3";
import rain from "../assets/ambient/rain.mp3";
import storm from "../assets/ambient/storm.mp3";

/** Ambience loops (CC0, see assets/ambient/CREDITS.md). */
export const AMBIENCE = { rain, storm, cafe, fireplace, forest } as const;
export type Ambience = keyof typeof AMBIENCE | "off";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  /** The mood the genre chips filter by. */
  genre: string;
  /** The bundled file's URL. */
  src: string;
  /** Length in seconds. */
  seconds: number;
}

// Bundled with the app: Root's mobile app blocks audio from other sites.
const FILES = import.meta.glob<string>("../assets/music/*.mp3", {
  eager: true,
  query: "?url",
  import: "default",
});

/** HoliznaCC0's "Public Domain Lofi" (CC0, see assets/music/CREDITS.md). */
export const TRACKS: Track[] = (
  [
    ["when-time-called-me-darling", "When Time Called Me Darling", "Chill", 215],
    ["still-life", "Still Life", "Chill", 135],
    ["birds", "Birds", "Chill", 170],
    ["theta-frequency", "Theta Frequency", "Chill", 127],
    ["shimmer", "Shimmer", "Chill", 181],
    ["ease-into-night", "Ease into Night", "Chill", 152],
    ["calm-currents", "Calm Currents", "Calm", 148],
    ["waiting-around", "Waiting Around", "Calm", 152],
    ["reminders", "Reminders", "Calm", 145],
    ["color-of-a-soul", "Color of a Soul", "Calm", 157],
    ["wetlands", "Wetlands", "Calm", 164],
    ["lucid", "Lucid", "Dreamy", 145],
    ["moon-unit", "Moon Unit", "Dreamy", 172],
    ["one-night-in-france", "One Night in France", "Dreamy", 195],
    ["peaceful-drift", "Peaceful Drift", "Dreamy", 128],
    ["bubbles", "Bubbles", "Bright", 148],
    ["tranquil-mindscape", "Tranquil Mindscape", "Bright", 154],
    ["tokyo-sunset", "Tokyo Sunset", "Bright", 139],
    ["walking-away", "Walking Away", "Bright", 156],
    ["ocean-breeze", "Ocean Breeze", "Bright", 198],
  ] as const
).map(([id, title, genre, seconds]) => ({
  id,
  title,
  artist: "HoliznaCC0",
  album: "Public Domain Lofi",
  genre,
  src: FILES[`../assets/music/${id}.mp3`]!,
  seconds,
}));
