import {
  comboFor,
  formatCombo,
  formatCountdown,
  LIMITS,
  type MyStatusDto,
  type RoomStateDto,
} from "@studyroom/core";
import { useState, type FormEvent } from "react";
import type { StartRequest } from "../api/gateway";
import { PeopleIcon, TimerIcon } from "./Icons";
import { Sheet } from "./Sheet";
import { Toggle } from "./Toggle";

export const SOLO_LENGTHS = [15, 25, 45, 60, 90] as const;

interface StartSessionSheetProps {
  room: RoomStateDto;
  me: MyStatusDto;
  now: number;
  busy: boolean;
  initialMode: "room" | "solo";
  onClose(): void;
  onStartRoom(request: StartRequest): Promise<boolean>;
  onStartSolo(minutes: number, request: StartRequest): Promise<boolean>;
}

function roomHint(room: RoomStateDto, now: number) {
  const nextCombo = formatCombo(
    comboFor(room.roomParticipantCount + 1, room.features.comboEnabled),
  );
  const comboText = room.features.comboEnabled ? ` · combo goes to ${nextCombo}` : "";
  const { timer } = room;
  if (timer.phase === "idle") return `Starts round 1 for the room${comboText}`;
  if (timer.phase === "focus")
    return `${formatCountdown(timer.phaseEndsAt - now)} left in round ${timer.round}${comboText}`;
  return `On break · next round in ${formatCountdown(timer.phaseEndsAt - now)}${comboText}`;
}

/** "What are you working on?" Goals, privacy, and room vs solo timer. */
export function StartSessionSheet(props: StartSessionSheetProps) {
  const { room, me, now, busy, onClose } = props;
  const openGoals = me.goals.filter((g) => !g.done).length;
  const slots = Math.max(0, Math.min(2, LIMITS.maxOpenGoals - openGoals));
  const [goals, setGoals] = useState<string[]>(() => Array(slots).fill(""));
  const [goalsPrivate, setGoalsPrivate] = useState(me.goalsPrivate);
  const [mode, setMode] = useState<"room" | "solo">(props.initialMode);
  const [preset, setPreset] = useState<number>(25);
  // Any whole length the server accepts, typed in. Some secret badges need one.
  const [custom, setCustom] = useState<string | null>(null);
  const minutes = custom === null ? preset : Number(custom);
  const minutesValid =
    Number.isInteger(minutes) &&
    minutes >= LIMITS.soloMinMinutes &&
    minutes <= LIMITS.soloMaxMinutes;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const request = { goals: goals.map((g) => g.trim()).filter(Boolean), goalsPrivate };
    const ok =
      mode === "room"
        ? await props.onStartRoom(request)
        : await props.onStartSolo(minutes, request);
    if (ok) onClose();
  }

  return (
    <Sheet labelledBy="start-title" onClose={onClose}>
      <form onSubmit={submit} style={{ display: "contents" }}>
        <h1 id="start-title">What are you working on?</h1>

        {slots > 0 && (
          <div className="field">
            <label htmlFor="goal-0" className="field-label">
              Goals for this session
            </label>
            {goals.map((value, i) => (
              <div key={i}>
                {i > 0 && (
                  <label htmlFor={`goal-${i}`} className="visually-hidden">
                    Another goal
                  </label>
                )}
                <input
                  id={`goal-${i}`}
                  className="input"
                  style={{ minHeight: 48, fontSize: 16 }}
                  value={value}
                  maxLength={LIMITS.goalTextMaxLength}
                  placeholder={i === 0 ? "e.g. Make 20 flashcards" : "Add another goal (optional)"}
                  data-autofocus={i === 0 ? true : undefined}
                  onChange={(e) =>
                    setGoals((list) => list.map((g, j) => (j === i ? e.target.value : g)))
                  }
                />
              </div>
            ))}
            {openGoals > 0 && (
              <div className="tiny dim">
                You already have {openGoals} open {openGoals === 1 ? "goal" : "goals"}. They stay on
                your list.
              </div>
            )}
          </div>
        )}

        <div className="setting-row">
          <div>
            <div style={{ fontWeight: 700 }}>Keep my goals private</div>
            <div className="hint">Others will see "Focusing"</div>
          </div>
          <Toggle label="Keep my goals private" checked={goalsPrivate} onChange={setGoalsPrivate} />
        </div>

        <div className="field" role="radiogroup" aria-label="Timer">
          <div className="field-label">Timer</div>
          <button
            type="button"
            role="radio"
            className="choice"
            aria-checked={mode === "room"}
            onClick={() => setMode("room")}
          >
            <PeopleIcon size={22} stroke={mode === "room" ? "var(--amber)" : "var(--text-muted)"} />
            <span style={{ flex: 1 }}>
              <span className="choice-title">Join the room timer</span>
              <span className="choice-sub">{roomHint(room, now)}</span>
            </span>
          </button>
          <button
            type="button"
            role="radio"
            className="choice"
            aria-checked={mode === "solo"}
            onClick={() => setMode("solo")}
          >
            <TimerIcon size={22} stroke={mode === "solo" ? "var(--amber)" : "var(--text-muted)"} />
            <span style={{ flex: 1 }}>
              <span className="choice-title">Solo timer</span>
              <span className="choice-sub">Pick your own length. Still shows on the board.</span>
            </span>
          </button>
          {mode === "solo" && (
            <div className="minutes" role="radiogroup" aria-label="Solo timer length">
              {SOLO_LENGTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={custom === null && preset === m}
                  onClick={() => {
                    setPreset(m);
                    setCustom(null);
                  }}
                >
                  {m} min
                </button>
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={custom !== null}
                onClick={() => setCustom((c) => c ?? String(preset))}
              >
                Custom
              </button>
            </div>
          )}
          {mode === "solo" && custom !== null && (
            <div className="custom-minutes">
              <label htmlFor="custom-minutes">Minutes</label>
              <input
                id="custom-minutes"
                type="number"
                inputMode="numeric"
                min={LIMITS.soloMinMinutes}
                max={LIMITS.soloMaxMinutes}
                step={1}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                aria-describedby="custom-minutes-hint"
              />
              <span id="custom-minutes-hint" className="choice-sub">
                {LIMITS.soloMinMinutes} to {LIMITS.soloMaxMinutes} minutes
              </span>
            </div>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-start"
          disabled={busy || (mode === "solo" && !minutesValid)}
        >
          Start focusing
        </button>
      </form>
    </Sheet>
  );
}
