import { formatCountdown } from "@studyroom/core";

interface KeepGoingProps {
  endsAt: number;
  now: number;
  busy: boolean;
  onKeepGoing(): void;
}

/**
 * Shown with the session buttons in the cycle's long break. Tapping rolls you
 * into the next cycle; otherwise the cycle ends your session as usual, and you
 * keep everything you earned.
 */
export function KeepGoing({ endsAt, now, busy, onKeepGoing }: KeepGoingProps) {
  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={busy}
      onClick={onKeepGoing}
      aria-keyshortcuts="Enter"
      title="Stay on the room timer for the next cycle"
    >
      Keep going · {formatCountdown(endsAt - now).replace(/^0(\d)/, "$1")}
    </button>
  );
}
