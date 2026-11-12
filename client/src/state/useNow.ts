import { useEffect, useRef, useState } from "react";

/**
 * Current server time, refreshed a few times a second. Countdowns are always
 * computed from server timestamps, so a late tick never makes them drift.
 * The latest `now` is kept in a ref so a re-render (music progress fires
 * several times a second) never restarts the interval before it ticks.
 */
export function useNow(now: () => number, intervalMs = 250): number {
  const [value, setValue] = useState(now);
  const nowRef = useRef(now);
  useEffect(() => {
    nowRef.current = now;
  }, [now]);
  useEffect(() => {
    const id = setInterval(() => setValue(nowRef.current()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return value;
}
