import type { MyStatusKind } from "@studyroom/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioChannel } from "../lib/audioChannel";
import { AMBIENCE, fetchTracks, trackUrl, type Ambience, type Track } from "../lib/library";
import { phaseOf } from "../lib/sounds";

const KEY = "studysquad.sounds";

export interface SoundSettings {
  ambience: Ambience;
  ambienceVolume: number;
  musicVolume: number;
  shuffle: boolean;
  pauseOnBreaks: boolean;
  genre: string;
  trackId: string | null;
}

const DEFAULTS: SoundSettings = {
  ambience: "off",
  ambienceVolume: 30,
  musicVolume: 50,
  shuffle: false,
  pauseOnBreaks: true,
  genre: "All",
  trackId: null,
};

function readSettings(): SoundSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<SoundSettings>;
    const s = { ...DEFAULTS, ...saved };
    if (s.ambience !== "off" && !(s.ambience in AMBIENCE)) s.ambience = "off";
    return s;
  } catch {
    return DEFAULTS;
  }
}

function writeSettings(s: SoundSettings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage can be blocked. The choice then lasts until the app reloads.
  }
}

/** The tracks the player steps through: the chosen genre, or all of them. */
export function queueOf(tracks: Track[], genre: string): Track[] {
  return genre === "All" ? tracks : tracks.filter((t) => t.genre === genre);
}

/** The track after `current` in `queue`, or a different random one when shuffling. */
export function nextTrack(
  queue: Track[],
  current: string | null,
  step: 1 | -1,
  shuffle: boolean,
  random = Math.random,
): Track | null {
  if (queue.length === 0) return null;
  const at = queue.findIndex((t) => t.id === current);
  if (shuffle && queue.length > 1) {
    const others = queue.filter((_, i) => i !== at);
    return others[Math.floor(random() * others.length)]!;
  }
  return queue[(at + step + queue.length) % queue.length]!;
}

/**
 * Your music and ambience. Music plays when you press play; ambience plays
 * while you're in a session. Both fade out on breaks unless you turn that
 * off. Settings are saved per member and per device.
 */
export function useSounds(status: MyStatusKind | null, load = fetchTracks) {
  const [settings, setSettings] = useState(readSettings);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState({ seconds: 0, duration: 0 });

  const phase = status === null ? "idle" : phaseOf(status);
  const onBreak = phase === "break";
  const queue = useMemo(() => queueOf(tracks ?? [], settings.genre), [tracks, settings.genre]);
  const track = (tracks ?? []).find((t) => t.id === settings.trackId) ?? queue[0] ?? null;

  const update = useCallback((patch: Partial<SoundSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      writeSettings(next);
      return next;
    });
  }, []);

  const skip = useCallback(
    (step: 1 | -1) => {
      const next = nextTrack(queue, track?.id ?? null, step, settings.shuffle);
      if (next) update({ trackId: next.id });
    },
    [queue, track, settings.shuffle, update],
  );
  const skipRef = useRef(skip);
  useEffect(() => {
    skipRef.current = skip;
  }, [skip]);

  const channels = useRef<{ music: AudioChannel; ambience: AudioChannel } | null>(null);
  channels.current ??= {
    music: new AudioChannel(
      () => skipRef.current(1),
      (seconds, duration) => setProgress({ seconds, duration }),
    ),
    ambience: new AudioChannel(),
  };

  const musicOn = playing && !!track && !(onBreak && settings.pauseOnBreaks);
  useEffect(() => {
    channels.current!.music.set(
      track ? trackUrl(track) : null,
      settings.musicVolume / 100,
      musicOn,
    );
  }, [track, settings.musicVolume, musicOn]);

  const ambienceOn =
    settings.ambience !== "off" && (phase === "focus" || (onBreak && !settings.pauseOnBreaks));
  useEffect(() => {
    const src = settings.ambience === "off" ? null : AMBIENCE[settings.ambience];
    channels.current!.ambience.set(src, settings.ambienceVolume / 100, ambienceOn, true);
  }, [settings.ambience, settings.ambienceVolume, ambienceOn]);

  // Fade everything out if the room screen goes away.
  useEffect(
    () => () => {
      channels.current?.music.set(null, 0, false);
      channels.current?.ambience.set(null, 0, false);
    },
    [],
  );

  /** The track list is fetched the first time someone opens the player. */
  const loadTracks = useCallback(() => {
    if (tracks === null) void load().then(setTracks);
  }, [tracks, load]);

  return {
    settings,
    update,
    tracks,
    loadTracks,
    queue,
    track,
    playing,
    progress,
    musicOn,
    ambienceOn,
    togglePlay: () => setPlaying((p) => !p),
    playTrack: (id: string) => {
      update({ trackId: id });
      setPlaying(true);
    },
    skip,
  };
}

export type Sounds = ReturnType<typeof useSounds>;
