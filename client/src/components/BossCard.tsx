import { formatCombo, formatXp, type BossDto } from "@studyroom/core";
import { percent } from "../lib/view";
import { SwordIcon } from "./Icons";

const DAY_MS = 86_400_000;

function daysLeft(boss: BossDto, now: number): string {
  const days = Math.max(0, Math.ceil((boss.endsAt - now) / DAY_MS));
  return days === 1 ? "1 day left" : `${days} days left`;
}

function hpLeft(boss: BossDto) {
  return Math.max(0, boss.maxHpXp - boss.damageXp);
}

/** "7,320 of 12,000" — HP left rounds up so a boss never reads 0 before it's defeated. */
export function hpText(boss: BossDto): string {
  const left = boss.defeated ? 0 : Math.ceil(hpLeft(boss));
  return `${formatXp(left)} of ${formatXp(boss.maxHpXp)}`;
}

/** "Strength 1.5×" — 1 decimal like the combo, or 2 when needed so 1.25 doesn't read as 1.3. */
export function strengthText(boss: BossDto): string {
  const digits = Number.isInteger(boss.strength * 10) ? 1 : 2;
  return `Strength ${boss.strength.toFixed(digits)}×`;
}

export function BossCard({ boss, combo, now }: { boss: BossDto; combo: number; now: number }) {
  const left = hpLeft(boss);
  const defeatedPct = percent(boss.damageXp, boss.maxHpXp);
  return (
    <section aria-label="Weekly boss" className="card boss" data-defeated={boss.defeated}>
      <div className="row-between">
        <div className="eyebrow">
          <SwordIcon />
          Weekly boss
        </div>
        <div className="tiny muted">{daysLeft(boss, now)}</div>
      </div>
      <div className="row-between">
        <div className="boss-name">{boss.name}</div>
        <div
          className="tiny"
          style={{ color: "var(--boss-muted)", whiteSpace: "nowrap", flexShrink: 0 }}
        >
          {strengthText(boss)}
        </div>
      </div>
      <div>
        <div
          className="bar"
          role="meter"
          aria-label={`${boss.name} health`}
          aria-valuemin={0}
          aria-valuemax={boss.maxHpXp}
          aria-valuenow={left}
        >
          <span style={{ width: `${100 - defeatedPct}%` }} />
        </div>
        <div
          className="row-between tabular"
          style={{ marginTop: 6, fontSize: 13, color: "var(--boss-muted)" }}
        >
          <span>{hpText(boss)} HP left</span>
          <span>{defeatedPct}% defeated</span>
        </div>
      </div>
      <div className="boss-text">
        {boss.defeated ? (
          boss.lootXp > 0 ? (
            `Defeated! Everyone who pitched in earned +${boss.lootXp} XP. A new boss spawns Monday.`
          ) : (
            "Defeated! A new boss spawns Monday."
          )
        ) : (
          <>
            Every XP you earn is damage, live each minute you focus. Right now the room hits at{" "}
            <strong>{formatCombo(combo)}</strong>.
            {boss.lootXp > 0 && <> Defeat it for +{boss.lootXp} XP each.</>}
          </>
        )}
      </div>
    </section>
  );
}

export function MobileBoss({ boss }: { boss: BossDto }) {
  return (
    <div className="mobile-boss">
      <div className="row-between">
        <span style={{ fontWeight: 700, color: "var(--coral-text)" }}>Boss: {boss.name}</span>
        <span style={{ color: "var(--boss-muted)" }}>
          {boss.defeated ? "Defeated" : `${hpText(boss).replace(" of ", " / ")} HP`}
        </span>
      </div>
      <div className="bar" aria-hidden="true">
        <span style={{ width: `${100 - percent(boss.damageXp, boss.maxHpXp)}%` }} />
      </div>
    </div>
  );
}
