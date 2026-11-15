import { useMemo } from "react";
import type { Celebration as CelebrationState } from "../state/roomState";

const COLORS = ["#F5B83D", "#46C7AE", "#FF6B57", "#9DB7FF"];

/** Deterministic confetti layout (Park-Miller generator), so every client draws the same burst. */
export function confettiPieces(seed: number, count = 36) {
  let state = Math.max(1, Math.floor(seed) % 2147483647);
  const next = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  return Array.from({ length: count }, (_, i) => ({
    left: next() * 100,
    delay: next() * 0.6,
    rotate: next() * 360,
    color: COLORS[i % COLORS.length],
  }));
}

/**
 * The same small burst on every screen when a round ends. Positions come
 * from the round number, so every client renders identical confetti.
 */
export function Celebration({ celebration }: { celebration: CelebrationState }) {
  const pieces = useMemo(
    () => confettiPieces(celebration.round * 9973 + celebration.finisherIds.length),
    [celebration.round, celebration.finisherIds.length],
  );

  const people = celebration.finisherIds.length;
  return (
    <>
      <div className="confetti" aria-hidden="true">
        {pieces.map((p, i) => (
          <span
            key={i}
            style={{
              left: `${p.left}%`,
              background: p.color,
              animationDelay: `${p.delay}s`,
              transform: `rotate(${p.rotate}deg)`,
            }}
          />
        ))}
      </div>
      <div className="celebration" role="status">
        {/* Short enough for one line on a phone; the combo is already in the timer. */}
        Round {celebration.round} complete · {people} finished
        {celebration.xpEarned ? ` · +${celebration.xpEarned} XP` : ""}
      </div>
    </>
  );
}
