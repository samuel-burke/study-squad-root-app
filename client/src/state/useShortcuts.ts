import { useEffect, useRef } from "react";

/** True while the member is typing, when a plain key belongs to the text. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches("input, textarea, select");
}

/**
 * Single-key shortcuts, keyed by `event.key` ("f", "?", "Enter"). Never with
 * Ctrl, Cmd or Alt held, which belong to Root and the browser, or while typing.
 * Letters ignore Caps Lock but not Shift, so Shift (Root's push to talk) plus a
 * letter does nothing.
 */
export function useShortcuts(keys: Record<string, () => void>, enabled: boolean) {
  const latest = useRef(keys);
  useEffect(() => {
    latest.current = keys;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      // Enter on a button or link is that button's own.
      if (event.key === "Enter" && (event.target as HTMLElement).closest?.("button, a")) return;
      const key = event.shiftKey ? event.key : event.key.toLowerCase();
      const run = latest.current[key];
      if (!run) return;
      event.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
