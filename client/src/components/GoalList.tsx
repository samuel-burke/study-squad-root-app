import { LIMITS, type GoalDto } from "@studyroom/core";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { goalDuration } from "../lib/view";
import { ChevronIcon, CloseIcon, GripIcon, PencilIcon, PlusIcon } from "./Icons";

/** Everything the goal list can ask for. */
export interface GoalActions {
  toggle(goalId: string, done: boolean): void;
  remove(goalId: string): void;
  add(text: string): Promise<boolean>;
  edit(goalId: string, text: string): Promise<boolean>;
  clearDone(): void;
  /** Open goals, top first. */
  reorder(goalIds: string[]): void;
}

interface GoalListProps {
  goals: GoalDto[];
  busy: boolean;
  actions: GoalActions;
}

interface Drag {
  id: string;
  pointerId: number;
  /** Where in the row the pointer grabbed it. */
  grabY: number;
  pointerY: number;
  offset: number;
}

/**
 * Open goals in the member's order, dragged by their handle (or moved with the
 * arrow keys on it). The top one is the goal on their card. Finished goals fold
 * into a "Done" row with how long each took, and clear in one go.
 */
export function GoalList({ goals, busy, actions }: GoalListProps) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  // The order sent to the server, and the goals it was made from. Shown until
  // the reply arrives; if the request fails, the server's order comes back.
  const [pending, setPending] = useState<{ ids: string[]; basis: GoalDto[] } | null>(null);
  // The order while a drag is under way.
  const [working, setWorking] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const drag = useRef<Drag | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const inputId = useId();

  const openGoals = goals.filter((g) => !g.done);
  const done = goals
    .filter((g) => g.done)
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
  const serverOrder = openGoals.map((g) => g.id);
  const waiting = pending && busy && pending.basis === goals ? pending.ids : null;
  const order = arrange(serverOrder, working ?? waiting);
  const byId = new Map(openGoals.map((g) => [g.id, g]));
  const open = order.map((id) => byId.get(id)!);

  function placeDragged() {
    const d = drag.current;
    const row = d && rows.current.get(d.id);
    if (!d || !row) return;
    const naturalTop = row.getBoundingClientRect().top - d.offset;
    d.offset = d.pointerY - d.grabY - naturalTop;
    row.style.transform = `translateY(${d.offset}px)`;
  }

  // Keep the dragged row under the pointer as the rows around it move.
  useLayoutEffect(() => placeDragged());

  function commit(next: string[], movedId: string) {
    if (next.join() === serverOrder.join()) return;
    setPending({ ids: next, basis: goals });
    actions.reorder(next);
    const goal = byId.get(movedId);
    if (goal) {
      setAnnouncement(`${goal.text} moved to ${next.indexOf(movedId) + 1} of ${next.length}.`);
    }
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
    const row = rows.current.get(id);
    if (busy || !row || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id,
      pointerId: event.pointerId,
      grabY: event.clientY - row.getBoundingClientRect().top,
      pointerY: event.clientY,
      offset: 0,
    };
    setWorking(order);
    setDraggingId(id);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId || !working) return;
    d.pointerY = event.clientY;
    const row = rows.current.get(d.id);
    if (!row) return;
    const center = d.pointerY - d.grabY + row.offsetHeight / 2;
    const others = working.filter((id) => id !== d.id);
    const index = others.filter((id) => {
      const rect = rows.current.get(id)?.getBoundingClientRect();
      return rect ? rect.top + rect.height / 2 < center : false;
    }).length;
    const next = [...others.slice(0, index), d.id, ...others.slice(index)];
    if (next.join() !== working.join()) setWorking(next);
    else placeDragged();
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    rows.current.get(d.id)?.style.removeProperty("transform");
    drag.current = null;
    if (working && event.type === "pointerup") commit(working, d.id);
    setWorking(null);
    setDraggingId(null);
  }

  function keyMove(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    const from = order.indexOf(id);
    const to = from + step;
    if (!step || busy || to < 0 || to >= order.length) return;
    event.preventDefault();
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, id);
    commit(next, id);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    if (await actions.add(text)) {
      setText("");
      setAdding(false);
    }
  }

  const row = (goal: GoalDto, index: number) => (
    <li
      key={goal.id}
      ref={(node) => {
        if (node) rows.current.set(goal.id, node);
        else rows.current.delete(goal.id);
      }}
      className="goal"
      data-done={goal.done}
      data-dragging={draggingId === goal.id}
    >
      {goal.id === editingId ? (
        <GoalEditor
          goal={goal}
          busy={busy}
          onSave={async (next) => {
            if (next === goal.text || (await actions.edit(goal.id, next))) setEditingId(null);
          }}
          onCancel={() => setEditingId(null)}
        />
      ) : (
        <>
          {!goal.done && open.length > 1 && (
            <button
              type="button"
              className="goal-grip"
              aria-label={`Reorder goal: ${goal.text}. Use the up and down arrow keys.`}
              disabled={busy}
              onPointerDown={(e) => startDrag(e, goal.id)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(e) => keyMove(e, goal.id)}
            >
              <GripIcon size={16} />
            </button>
          )}
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
              {!goal.done && index === 0 && open.length > 1 && (
                <span className="goal-current tiny">On your card</span>
              )}
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
        </>
      )}
    </li>
  );

  return (
    <>
      {open.length > 0 ? (
        <ul className="goal-list" aria-label="Open goals">
          {open.map(row)}
        </ul>
      ) : (
        <div className="small dim">
          {done.length > 0
            ? "All done. Add another goal to keep going."
            : "No goals yet. Add one so the room knows what you're working on."}
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
        <div className="done-fold">
          <div className="done-fold-head">
            <button
              type="button"
              className="done-toggle"
              aria-expanded={showDone}
              onClick={() => setShowDone(!showDone)}
            >
              <ChevronIcon size={14} />
              Finished ({done.length})
            </button>
            <button
              type="button"
              className="clear-done"
              disabled={busy}
              onClick={() => actions.clearDone()}
            >
              Clear completed
            </button>
          </div>
          {showDone && (
            <ul className="goal-list" aria-label="Finished goals">
              {done.map(row)}
            </ul>
          )}
        </div>
      )}
      <div className="visually-hidden" aria-live="polite">
        {announcement}
      </div>
    </>
  );
}

/** `preferred` order, dropping ids that are gone and adding any it lacks at the end. */
function arrange(current: string[], preferred: string[] | null): string[] {
  if (!preferred) return current;
  const known = new Set(current);
  const kept = preferred.filter((id) => known.has(id));
  return [...kept, ...current.filter((id) => !kept.includes(id))];
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
