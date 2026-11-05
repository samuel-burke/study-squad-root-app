import { formatCombo, GAME } from "@studyroom/core";
import { BoltIcon } from "./Icons";

const PIP_COUNT = Math.round((GAME.comboMax - 1) / GAME.comboStep);

export function ComboCard({ combo, participants }: { combo: number; participants: number }) {
  const lit = Math.round((combo - 1) / GAME.comboStep);
  return (
    <section aria-label="Combo meter" className="card combo">
      <div className="row-between">
        <div className="eyebrow">
          <BoltIcon />
          Combo
        </div>
        <div className="combo-value">{formatCombo(combo)}</div>
      </div>
      <div className="pips" aria-hidden="true">
        {Array.from({ length: PIP_COUNT }, (_, i) => (
          <span key={i} className="pip" data-on={i < lit} />
        ))}
      </div>
      <div className="small muted">
        {participants === 1 ? "1 person" : `${participants} people`} on the room timer. Each extra
        person adds {GAME.comboStep}x, up to {GAME.comboMax.toFixed(1)}x.
      </div>
    </section>
  );
}

export function ComboPill({ combo, participants }: { combo: number; participants: number }) {
  return (
    <div className="combo-pill">
      <BoltIcon size={14} stroke="var(--amber-strong)" />
      <strong>{formatCombo(combo)} combo</strong>
      <span className="muted">· {participants} on the room timer</span>
    </div>
  );
}
