import { useEffect, useRef, useState } from "react";

/**
 * Current server time, refreshed a few times a second. Countdowns are always
 * computed from server timestamps, so a late tick never makes them drift.
 * The latest `now` is kept in a ref so a re-render (music progress fires
 * several times a second) never restarts the interval before it ticks.
 *
 * With `endsAt`, it also refreshes the moment that countdown's seconds digit
 * changes, so the clock flips together with the countdown ticks instead of up
 * to a quarter second after them.
 */
export function useNow(now: () => number, endsAt: number | null = null, intervalMs = 250): number {
  const [value, setValue] = useState(now);
  const nowRef = useRef(now);
  useEffect(() => {
    nowRef.current = now;
  }, [now]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const left = endsAt === null ? 0 : endsAt - nowRef.current();
      const untilFlip = left > 0 ? left % 1000 || 1000 : intervalMs;
      timer = setTimeout(tick, Math.min(intervalMs, untilFlip));
    };
    const tick = () => {
      setValue(nowRef.current());
      schedule();
    };
    schedule();
    return () => clearTimeout(timer);
  }, [endsAt, intervalMs]);
  return value;
}
