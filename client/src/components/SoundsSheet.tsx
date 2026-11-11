import { useState, type ReactNode } from "react";
import type { Ambience } from "../lib/library";
import type { Sounds } from "../state/useSounds";
import {
  CafeIcon,
  FireIcon,
  ForestIcon,
  MusicIcon,
  NextIcon,
  OffIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RainIcon,
  ShuffleIcon,
  StormIcon,
} from "./Icons";
import { Sheet } from "./Sheet";
import { Toggle } from "./Toggle";

const AMBIENCES: [Ambience, string, ReactNode][] = [
  ["off", "Off", <OffIcon key="off" size={20} />],
  ["rain", "Rain", <RainIcon key="rain" size={20} />],
  ["storm", "Storm", <StormIcon key="storm" size={20} />],
  ["cafe", "Café", <CafeIcon key="cafe" size={20} />],
  ["fireplace", "Fireplace", <FireIcon key="fire" size={20} />],
  ["forest", "Forest", <ForestIcon key="forest" size={20} />],
];

const SHORT_LIST = 5;

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Your music player, the ambience under it, and the sound effects switch. */
export function SoundsSheet({
  sounds,
  effectsOn,
  onEffects,
  onClose,
  wide,
}: {
  sounds: Sounds;
  effectsOn: boolean;
  onEffects(on: boolean): void;
  onClose(): void;
  wide: boolean;
}) {
  const { settings, update } = sounds;

  const music = <Music sounds={sounds} />;
  const ambience = (
    <section className="sounds-col" aria-labelledby="ambience-title">
      <div className="row-between">
        <h2 id="ambience-title">Ambience</h2>
        <span className="tiny dim">Plays under the music</span>
      </div>
      <div className="ambience-grid" role="group" aria-labelledby="ambience-title">
        {AMBIENCES.map(([id, name, icon]) => (
          <button
            key={id}
            type="button"
            className="ambience-choice"
            aria-pressed={settings.ambience === id}
            onClick={() => update({ ambience: id })}
          >
            {icon}
            {name}
          </button>
        ))}
      </div>
      <Volume
        label="Ambience"
        value={settings.ambienceVolume}
        onChange={(v) => update({ ambienceVolume: v })}
      />
    </section>
  );

  return (
    <Sheet labelledBy="sounds-title" onClose={onClose} className={wide ? "sheet-wide" : ""}>
      <h1 id="sounds-title">Sounds</h1>
      {wide ? (
        <div className="sounds-cols">
          {music}
          {ambience}
        </div>
      ) : (
        <>
          {music}
          <hr className="divider" />
          {ambience}
        </>
      )}
      <hr className="divider" />
      <div className="setting-row">
        <div>
          <div style={{ fontWeight: 700 }}>Pause on breaks</div>
          <div className="hint">Music and ambience fade out when a break starts</div>
        </div>
        <Toggle
          label="Pause on breaks"
          checked={settings.pauseOnBreaks}
          onChange={(on) => update({ pauseOnBreaks: on })}
        />
      </div>
      <div className="setting-row">
        <div>
          <div style={{ fontWeight: 700 }}>Sound effects</div>
          <div className="hint">Chimes, countdown ticks and badge fanfares</div>
        </div>
        <Toggle label="Sound effects" checked={effectsOn} onChange={onEffects} />
      </div>
      <button type="button" className="btn" onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}

function Music({ sounds }: { sounds: Sounds }) {
  const { settings, update, tracks, queue, track, playing, progress } = sounds;
  const [showAll, setShowAll] = useState(false);
  const genres = ["All", ...new Set(tracks.map((t) => t.genre))];
  const shown = showAll ? queue : queue.slice(0, SHORT_LIST);
  const duration = progress.duration || track?.seconds || 0;
  const elapsed = playing || progress.seconds ? progress.seconds : 0;

  return (
    <section className="sounds-col" aria-labelledby="music-title">
      <div className="row-between">
        <h2 id="music-title">Music</h2>
        <span className="tiny dim">{tracks.length} tracks · all free to use</span>
      </div>
      {track && (
        <>
          <div className="now-playing">
            <div className="track-art" aria-hidden="true">
              <MusicIcon size={28} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="np-title">{track.title}</div>
              <div className="small muted">
                {track.artist} · {track.album}
              </div>
              <div
                className="np-bar"
                role="progressbar"
                aria-label="Track progress"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(elapsed)}
              >
                <i style={{ width: `${duration ? (elapsed / duration) * 100 : 0}%` }} />
              </div>
              <div className="np-times tiny dim">
                <span>{clock(elapsed)}</span>
                <span>{clock(duration)}</span>
              </div>
            </div>
          </div>
          <div className="player-controls">
            <button
              type="button"
              className="player-btn"
              aria-label="Shuffle"
              aria-pressed={settings.shuffle}
              onClick={() => update({ shuffle: !settings.shuffle })}
            >
              <ShuffleIcon size={20} />
            </button>
            <button
              type="button"
              className="player-btn"
              aria-label="Previous track"
              onClick={() => sounds.skip(-1)}
            >
              <PrevIcon size={20} />
            </button>
            <button
              type="button"
              className="player-btn play"
              aria-label={playing ? "Pause music" : "Play music"}
              onClick={sounds.togglePlay}
            >
              {playing ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
            </button>
            <button
              type="button"
              className="player-btn"
              aria-label="Next track"
              onClick={() => sounds.skip(1)}
            >
              <NextIcon size={20} />
            </button>
            <span className="player-btn" aria-hidden="true" />
          </div>
          {genres.length > 2 && (
            <div className="genre-chips" role="group" aria-label="Genre">
              {genres.map((g) => (
                <button
                  key={g}
                  type="button"
                  className="genre-chip"
                  aria-pressed={settings.genre === g}
                  onClick={() => update({ genre: g })}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
          <ol className="track-list" aria-label="Tracks">
            {shown.map((t, i) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="track-row"
                  aria-current={t.id === track.id ? "true" : undefined}
                  onClick={() => sounds.playTrack(t.id)}
                >
                  <span className="track-n">
                    {t.id === track.id ? <MusicIcon size={14} /> : i + 1}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="track-title">{t.title}</span>
                    <span className="tiny muted">{t.artist}</span>
                  </span>
                  <span className="tiny dim tabular">{clock(t.seconds)}</span>
                </button>
              </li>
            ))}
          </ol>
          {queue.length > SHORT_LIST && (
            <button type="button" className="btn btn-quiet" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Show fewer" : `Show all ${queue.length} tracks`}
            </button>
          )}
        </>
      )}
      <Volume
        label="Music"
        value={settings.musicVolume}
        onChange={(v) => update({ musicVolume: v })}
      />
    </section>
  );
}

function Volume({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange(value: number): void;
}) {
  return (
    <label className="sound-volume">
      <span className="small muted">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        aria-label={`${label} volume`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="small tabular">{value}%</span>
    </label>
  );
}

/** What's playing, on the room screen, with pause and next. */
export function MiniPlayer({ sounds }: { sounds: Sounds }) {
  const { track, playing, settings } = sounds;
  if (!track || !playing) return null;
  const withAmbience =
    settings.ambience !== "off"
      ? ` · with ${AMBIENCES.find(([id]) => id === settings.ambience)![1]}`
      : "";
  return (
    <div className="mini-player" role="region" aria-label="Now playing">
      <div className="track-art small" aria-hidden="true">
        <MusicIcon size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="np-title small-title">{track.title}</div>
        <div className="tiny muted ellipsis">
          {track.artist}
          {withAmbience}
        </div>
      </div>
      <button
        type="button"
        className="player-btn"
        aria-label="Pause music"
        onClick={sounds.togglePlay}
      >
        <PauseIcon size={20} />
      </button>
      <button
        type="button"
        className="player-btn"
        aria-label="Next track"
        onClick={() => sounds.skip(1)}
      >
        <NextIcon size={20} />
      </button>
    </div>
  );
}
