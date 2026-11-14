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
  adding,
}: {
  me: MyStatusDto;
  xpEnabled: boolean;
  busy: boolean;
  actions: GoalActions;
  onClose(): void;
  /** Opened to add a goal: the new-goal box is ready. */
  adding?: boolean;
}) {
  return (
    <Sheet labelledBy="goals-title" onClose={onClose}>
      <h1 id="goals-title">Your goals</h1>
      {xpEnabled && <XpBar me={me} />}
      <GoalList goals={me.goals} busy={busy} actions={actions} startAdding={adding} />
      <button type="button" className="btn" onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}
