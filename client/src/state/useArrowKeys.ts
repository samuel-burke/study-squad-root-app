import { useEffect, type RefObject } from "react";

const SELECTED = '[aria-checked="true"], [aria-pressed="true"], [aria-current="true"]';

interface ArrowOptions {
  /** Moving also picks the item, like radio buttons. */
  pick?: boolean;
  /** Which elements in the group are the items. Buttons by default. */
  items?: string;
}

/**
 * Arrow keys inside a group: the group is one Tab stop, ← → step through it,
 * ↑ ↓ go to the row above or below (or step, in a single row), Home and End
 * jump to the ends.
 */
export function useArrowKeys(ref: RefObject<HTMLElement | null>, options: ArrowOptions = {}) {
  const { pick = false, items = "button:not([disabled])" } = options;
  // Runs after every render, so items that come and go stay in step.
  useEffect(() => {
    const group = ref.current;
    if (!group) return;
    const list = () => [...group.querySelectorAll<HTMLElement>(items)];
    const all = list();
    const stop =
      all.find((el) => el === document.activeElement) ??
      (pick ? undefined : all.find((el) => el.dataset.stop !== undefined)) ??
      all.find((el) => el.matches(SELECTED)) ??
      all[0];
    const setStop = (target: HTMLElement) => {
      for (const el of list()) {
        el.tabIndex = el === target ? 0 : -1;
        if (el === target) el.dataset.stop = "";
        else delete el.dataset.stop;
      }
    };
    if (stop) setStop(stop);

    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const all = list();
      const from = all.indexOf(event.target as HTMLElement);
      if (from < 0) return;
      const target = next(all, from, event.key);
      if (!target) return;
      event.preventDefault();
      setStop(target);
      target.focus();
      if (pick && target !== all[from]) target.click();
    };
    group.addEventListener("keydown", onKey);
    return () => group.removeEventListener("keydown", onKey);
  });
}

function next(all: HTMLElement[], from: number, key: string): HTMLElement | undefined {
  const step = (by: number) => all[(from + by + all.length) % all.length];
  switch (key) {
    case "ArrowLeft":
      return step(-1);
    case "ArrowRight":
      return step(1);
    case "Home":
      return all[0];
    case "End":
      return all[all.length - 1];
    case "ArrowUp":
    case "ArrowDown":
      return rowNeighbor(all, from, key === "ArrowUp" ? -1 : 1) ?? step(key === "ArrowUp" ? -1 : 1);
    default:
      return undefined;
  }
}

/**
 * The item closest to this one's column in the next row up or down. Undefined
 * when every item sits in one row; this item itself at the top or bottom row.
 */
function rowNeighbor(all: HTMLElement[], from: number, dir: -1 | 1) {
  const rects = all.map((el) => el.getBoundingClientRect());
  const here = rects[from]!;
  if (rects.every((r) => Math.abs(r.top - here.top) <= 1)) return undefined;
  const tops = rects.map((r) => r.top).filter((t) => (t - here.top) * dir > 1);
  if (tops.length === 0) return all[from];
  const row = dir > 0 ? Math.min(...tops) : Math.max(...tops);
  const center = (r: DOMRect) => r.left + r.width / 2;
  let best: HTMLElement | undefined;
  let gap = Infinity;
  rects.forEach((r, i) => {
    if (Math.abs(r.top - row) > 1) return;
    const d = Math.abs(center(r) - center(here));
    if (d < gap) [best, gap] = [all[i], d];
  });
  return best;
}
