import {
  formatCountdown,
  MAIN_TABLE_ID,
  presetLabel,
  type MyStatusDto,
  type RoomStateDto,
} from "@studyroom/core";
import { nextLabel, phaseCaption, remainingFraction } from "../lib/view";
import { TimerRing } from "./TimerRing";

interface TimerCardProps {
  room: RoomStateDto;
  me: MyStatusDto;
  now: number;
  busy: boolean;
  compact?: boolean;
  onJoin(): void;
  onLeave(): void;
  onSolo(): void;
  onEndSolo(): void;
}

function ringTone(phase: RoomStateDto["timer"]["phase"]) {
  if (phase === "idle") return "idle" as const;
  return phase === "focus" ? ("focus" as const) : ("break" as const);
}

/** The room timer: the hero of the screen. Joining the room is the brighter button. */
export function TimerCard({
  room,
  me,
  now,
  busy,
  compact,
  onJoin,
  onLeave,
  onSolo,
  onEndSolo,
}: TimerCardProps) {
  const { timer } = room;
  const time =
    timer.phase === "idle"
      ? formatCountdown(timer.preset.focusMinutes * 60_000)
      : formatCountdown(timer.phaseEndsAt - now);
  // At a table other than the main one, the timer is that table's.
  const table = room.tables.find((t) => t.id === me.tableId && t.id !== MAIN_TABLE_ID);
  const label = `${table ? table.name : "Room timer"} · ${presetLabel(timer.preset)}`;
  const onSoloTimer = me.status === "soloFocus" || me.status === "soloBreak";
  const ring = (
    <TimerRing
      size={compact ? 220 : 200}
      remaining={remainingFraction(timer, now)}
      tone={ringTone(timer.phase)}
    >
      <div className="ring-time" role="timer" aria-label={`${time} ${phaseCaption(timer)}`}>
        {time}
      </div>
      <div className="small muted">{compact ? label : phaseCaption(timer)}</div>
    </TimerRing>
  );

  if (compact) return <div className="mobile-timer">{ring}</div>;

  return (
    <section aria-label="Room timer" className="timer-card">
      {ring}
      <div className="timer-info">
        <div>
          <div className="small muted" style={{ fontWeight: 500 }}>
            {label}
          </div>
          <h1 className="timer-title">{table ? table.name : "Deep work, together"}</h1>
        </div>
        <div className="rounds">
          {Array.from({ length: timer.rounds }, (_, i) => (
            <span
              key={i}
              className="round-dot"
              data-done={timer.phase !== "idle" && i < timer.round}
            />
          ))}
          <span style={{ marginLeft: 6 }}>{nextLabel(timer)}</span>
        </div>
        <div className="actions">
          {me.onRoomTimer ? (
            <button type="button" className="btn" onClick={onLeave} disabled={busy}>
              {table ? "Leave table" : "Leave room timer"}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onJoin}
              disabled={busy || onSoloTimer}
            >
              Join room timer
            </button>
          )}
          {onSoloTimer ? (
            <button type="button" className="btn btn-quiet" onClick={onEndSolo} disabled={busy}>
              {me.status === "soloBreak" ? "Skip solo break" : "End solo timer"}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={onSolo}
              disabled={busy || me.onRoomTimer}
            >
              Start a solo timer
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
