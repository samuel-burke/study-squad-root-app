import type { MyStatusDto } from "@studyroom/core";
import { XpBar } from "./SessionPanel";
import { GoalList, type GoalActions } from "./GoalList";
import { Sheet } from "./Sheet";

/** The goal list as a sheet, for phones where there's no side panel. */
export function GoalsSheet({
  me,
  xpEnabled,
  busy,
  actions,
  onClose,
}: {
  me: MyStatusDto;
  xpEnabled: boolean;
  busy: boolean;
  actions: GoalActions;
  onClose(): void;
}) {
  return (
    <Sheet labelledBy="goals-title" onClose={onClose}>
      <h1 id="goals-title">Your goals</h1>
      {xpEnabled && <XpBar me={me} />}
      <GoalList goals={me.goals} busy={busy} actions={actions} />
      <button type="button" className="btn" onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}
