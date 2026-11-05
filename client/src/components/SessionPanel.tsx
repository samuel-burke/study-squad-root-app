import { GAME, type MyStatusDto } from "@studyroom/core";
import { percent } from "../lib/view";
import { GoalList, type GoalActions } from "./GoalList";

interface SessionPanelProps {
  me: MyStatusDto;
  xpEnabled: boolean;
  busy: boolean;
  goalActions: GoalActions;
}

export function XpBar({
  me,
}: {
  me: Pick<MyStatusDto, "level" | "xpIntoLevel" | "xpForNextLevel">;
}) {
  return (
    <div className="xp">
      <div className="row-between small muted tabular">
        <span style={{ fontWeight: 700, color: "var(--text)" }}>Level {me.level}</span>
        <span>
          {me.xpIntoLevel} / {me.xpForNextLevel} XP
        </span>
      </div>
      <div
        className="bar"
        style={{ marginTop: 6 }}
        role="progressbar"
        aria-label={`Level ${me.level} progress`}
        aria-valuemin={0}
        aria-valuemax={me.xpForNextLevel}
        aria-valuenow={me.xpIntoLevel}
      >
        <span style={{ width: `${percent(me.xpIntoLevel, me.xpForNextLevel)}%` }} />
      </div>
    </div>
  );
}

export function SessionPanel({ me, xpEnabled, busy, goalActions }: SessionPanelProps) {
  return (
    <section aria-label="Your session" className="card" style={{ gap: 14 }}>
      {xpEnabled && <XpBar me={me} />}
      <h2 style={{ fontSize: 17 }}>Your goals this session</h2>
      <GoalList goals={me.goals} busy={busy} actions={goalActions} />
      {xpEnabled && (
        <div className="tiny dim">
          +{GAME.xpPerGoal} XP for each goal you finish, up to {GAME.goalsWithXpPerDay} a day
        </div>
      )}
    </section>
  );
}
