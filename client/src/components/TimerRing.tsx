const RADIUS = 88;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface TimerRingProps {
  size: number;
  /** 1 = full ring, 0 = empty. */
  remaining: number;
  tone: "focus" | "break" | "idle";
  children: React.ReactNode;
}

const STROKE = { focus: "var(--amber-strong)", break: "var(--teal)", idle: "var(--outline-dim)" };

export function TimerRing({ size, remaining, tone, children }: TimerRingProps) {
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="var(--track)" strokeWidth="12" />
        <circle
          className="ring-progress"
          cx="100"
          cy="100"
          r={RADIUS}
          fill="none"
          stroke={STROKE[tone]}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - remaining)}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
