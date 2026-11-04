import { LIMITS, type GoalDto } from "@studyroom/core";
import { useId, useState, type FormEvent } from "react";
import { goalDuration } from "../lib/view";
import { CloseIcon, PencilIcon, PlusIcon } from "./Icons";

/** Everything the goal list can ask for. */
export interface GoalActions {
  toggle(goalId: string, done: boolean): void;
  remove(goalId: string): void;
  add(text: string): Promise<boolean>;
  edit(goalId: string, text: string): Promise<boolean>;
  clearDone(): void;
}

interface GoalListProps {
  goals: GoalDto[];
  busy: boolean;
  actions: GoalActions;
}

/**
 * Open goals first, in the order they were added, then finished goals in the
 * order they were ticked off, each with how long it took. Finished goals can
 * be cleared in one go so a long day doesn't bury what's left.
 */
export function GoalList({ goals, busy, actions }: GoalListProps) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const inputId = useId();

  const open = goals.filter((g) => !g.done);
  const done = goals
    .filter((g) => g.done)
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    if (await actions.add(text)) {
      setText("");
      setAdding(false);
    }
  }

  const row = (goal: GoalDto) =>
    goal.id === editingId ? (
      <li key={goal.id} className="goal" data-done={goal.done}>
        <GoalEditor
          goal={goal}
          busy={busy}
          onSave={async (next) => {
            if (next === goal.text || (await actions.edit(goal.id, next))) setEditingId(null);
          }}
          onCancel={() => setEditingId(null)}
        />
      </li>
    ) : (
      <li key={goal.id} className="goal" data-done={goal.done}>
        <label>
          <input
            type="checkbox"
            checked={goal.done}
            aria-label={goal.text}
            disabled={busy}
            onChange={(e) => actions.toggle(goal.id, e.target.checked)}
          />
          <span className="goal-body">
            <span className="text">{goal.text}</span>
            {goal.done && goal.completedAt !== null && (
              <span className="took tiny dim tabular">
                Took {goalDuration(goal.createdAt, goal.completedAt)}
              </span>
            )}
          </span>
        </label>
        <button
          type="button"
          className="goal-action"
          aria-label={`Edit goal: ${goal.text}`}
          disabled={busy}
          onClick={() => setEditingId(goal.id)}
        >
          <PencilIcon size={14} />
        </button>
        <button
          type="button"
          className="goal-action"
          aria-label={`Remove goal: ${goal.text}`}
          disabled={busy}
          onClick={() => actions.remove(goal.id)}
        >
          <CloseIcon size={14} />
        </button>
      </li>
    );

  return (
    <>
      {goals.length > 0 ? (
        <ul className="goal-list">
          {/* One array, so a goal moving between open and done keeps its row. */}
          {[...open, ...done].map(row)}
        </ul>
      ) : (
        <div className="small dim">
          No goals yet. Add one so the room knows what you're working on.
        </div>
      )}
      {adding ? (
        <form className="add-goal" onSubmit={submit}>
          <label htmlFor={inputId} className="visually-hidden">
            New goal
          </label>
          <input
            id={inputId}
            className="input"
            value={text}
            maxLength={LIMITS.goalTextMaxLength}
            placeholder="e.g. Finish chapter 4 notes"
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>
            Add
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-dashed" onClick={() => setAdding(true)}>
          <PlusIcon />
          Add a goal
        </button>
      )}
      {done.length > 0 && (
        <button
          type="button"
          className="btn btn-quiet clear-done"
          disabled={busy}
          onClick={() => actions.clearDone()}
        >
          Clear completed ({done.length})
        </button>
      )}
    </>
  );
}

function GoalEditor({
  goal,
  busy,
  onSave,
  onCancel,
}: {
  goal: GoalDto;
  busy: boolean;
  onSave(text: string): Promise<void>;
  onCancel(): void;
}) {
  const [text, setText] = useState(goal.text);
  const inputId = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (text.trim()) void onSave(text.trim());
  }

  return (
    <form className="edit-goal" onSubmit={submit}>
      <label htmlFor={inputId} className="visually-hidden">
        Edit goal
      </label>
      <input
        id={inputId}
        className="input"
        value={text}
        maxLength={LIMITS.goalTextMaxLength}
        autoFocus
        onFocus={(e) => e.target.select()}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>
        Save
      </button>
      <button type="button" className="btn btn-quiet" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
