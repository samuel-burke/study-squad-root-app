import { formatCombo, GAME } from "@studyroom/core";
import { BoltIcon } from "./Icons";

const PIP_COUNT = Math.round((GAME.comboMax - 1) / GAME.comboStep);

/** "6 people on the room timer", or "6 people at 3 tables" once there are tables. */
function whoCounts(participants: number, tables: number): string {
  const people = participants === 1 ? "1 person" : `${participants} people`;
  return tables > 1 ? `${people} at ${tables} tables` : `${people} on the room timer`;
}

export function ComboCard({
  combo,
  participants,
  tables = 1,
}: {
  combo: number;
  participants: number;
  tables?: number;
}) {
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
        {whoCounts(participants, tables)}.{tables > 1 && " Everyone at any table counts."} Each
        extra person adds {GAME.comboStep}x, up to {GAME.comboMax.toFixed(1)}x.
      </div>
    </section>
  );
}

export function ComboPill({
  combo,
  participants,
  tables = 1,
}: {
  combo: number;
  participants: number;
  tables?: number;
}) {
  return (
    <div className="combo-pill">
      <BoltIcon size={14} stroke="var(--amber-strong)" />
      <strong>{formatCombo(combo)} combo</strong>
      <span className="muted">
        · {tables > 1 ? `${participants} at ${tables} tables` : `${participants} on the room timer`}
      </span>
    </div>
  );
}
