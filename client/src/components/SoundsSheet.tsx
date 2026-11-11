import type { ReactNode } from "react";
import type { Ambient } from "../lib/ambient";
import { CafeIcon, MusicIcon, OffIcon, RainIcon } from "./Icons";
import { Sheet } from "./Sheet";
import { Toggle } from "./Toggle";

const CHOICES: [Ambient, string, string, ReactNode][] = [
  ["off", "Off", "Silence while you focus", <OffIcon key="off" size={20} />],
  ["rain", "Rain", "Steady rain on a window", <RainIcon key="rain" size={20} />],
  ["cafe", "Café", "Quiet chatter and cups", <CafeIcon key="cafe" size={20} />],
  ["lofi", "Lo-fi", "Three calm instrumental tracks", <MusicIcon key="lofi" size={20} />],
];

/** Your own sounds: a background while you focus, and the sound effects switch. */
export function SoundsSheet({
  sound,
  volume,
  effectsOn,
  onSound,
  onVolume,
  onEffects,
  onClose,
}: {
  sound: Ambient;
  volume: number;
  effectsOn: boolean;
  onSound(sound: Ambient): void;
  onVolume(volume: number): void;
  onEffects(on: boolean): void;
  onClose(): void;
}) {
  return (
    <Sheet labelledBy="sounds-title" onClose={onClose}>
      <h1 id="sounds-title">Sounds</h1>
      <div className="field">
        <div className="field-label" id="ambient-label">
          Background while you focus
        </div>
        <div className="sound-list" role="group" aria-labelledby="ambient-label">
          {CHOICES.map(([id, name, detail, icon]) => (
            <button
              key={id}
              type="button"
              className="sound-choice"
              aria-pressed={sound === id}
              onClick={() => onSound(id)}
            >
              <span className="sound-icon">{icon}</span>
              <span>
                <span className="sound-name">{name}</span>
                <span className="sound-detail">{detail}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <label className="sound-volume">
        <span className="small muted">Volume</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={volume}
          onChange={(e) => onVolume(Number(e.target.value))}
        />
        <span className="small tabular">{volume}%</span>
      </label>
      <div className="tiny dim">
        Plays only while you're focusing. It fades out on breaks and comes back when the next round
        starts.
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
