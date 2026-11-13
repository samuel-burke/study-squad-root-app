import { formatCombo, formatCountdown, type RoomStateDto } from "@studyroom/core";
import { isFocusing, phaseCaption, phasePill, percent, remainingFraction } from "../lib/view";
import { TimerRing } from "./TimerRing";

/**
 * Discord's picture-in-picture view of the Activity: just the timer, the
 * round, who is studying with the combo, and the boss bar.
 */
export function MiniView({ room, now }: { room: RoomStateDto; now: number }) {
  const { timer, boss, features } = room;
  const time =
    timer.phase === "idle"
      ? formatCountdown(timer.preset.focusMinutes * 60_000)
      : formatCountdown(timer.phaseEndsAt - now);
  const studying = room.members.filter(isFocusing).length;
  const showBoss = features.bossEnabled && boss.enabled && !boss.defeated;
  return (
    <main className="mini-view" aria-label="Study Squad timer">
      <TimerRing
        size={150}
        remaining={remainingFraction(timer, now)}
        tone={timer.phase === "idle" ? "idle" : timer.phase === "focus" ? "focus" : "break"}
      >
        <div className="ring-time" role="timer" aria-label={`${time} ${phaseCaption(timer)}`}>
          {time}
        </div>
        <div className="tiny muted">{phaseCaption(timer)}</div>
      </TimerRing>
      <div className="mini-info">
        <span className="mini-pill">{phasePill(timer)}</span>
        <div className="small">
          {studying} studying
          {features.comboEnabled && (
            <span className="muted"> · {formatCombo(room.combo)} combo</span>
          )}
        </div>
        {showBoss && (
          <div className="mini-boss">
            <div className="small">Boss: {boss.name}</div>
            <div
              className="mini-bar"
              role="progressbar"
              aria-label="Boss HP left"
              aria-valuenow={100 - percent(boss.damageXp, boss.maxHpXp)}
            >
              <span style={{ width: `${100 - percent(boss.damageXp, boss.maxHpXp)}%` }} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
