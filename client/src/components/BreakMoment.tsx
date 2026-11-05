import { formatCountdown, formatXp, type BossDto, type PersonalResultDto } from "@studyroom/core";
import type { Profile } from "../api/gateway";
import { percent } from "../lib/view";
import { Avatar } from "./Avatar";
import { hpText } from "./BossCard";
import { Sheet } from "./Sheet";

interface BreakMomentProps {
  result: PersonalResultDto;
  boss: BossDto;
  profiles: Map<string, Profile>;
  youId: string;
  xpEnabled: boolean;
  chatChannel: string;
  now: number;
  busy: boolean;
  onGoalDone(goalId: string): void;
  onClose(): void;
}

const MAX_AVATARS = 6;

/**
 * The moment the round ends: everyone who finished sees this at once, with
 * the XP math, the streak, the damage the room did, and a nudge to check off
 * the goal they were working on. Once the week's boss is down, sessions skip
 * the boss panel until the next one spawns.
 */
export function BreakMoment({
  result,
  boss,
  profiles,
  youId,
  xpEnabled,
  chatChannel,
  now,
  busy,
  onGoalDone,
  onClose,
}: BreakMomentProps) {
  const solo = result.source === "solo";
  const finishers = [youId, ...result.finisherIds.filter((id) => id !== youId)].filter((id) =>
    result.finisherIds.includes(id),
  );
  const hpLeft = Math.max(0, boss.maxHpXp - boss.damageXp);
  const hitPct = percent(Math.min(result.roomDamageXp, boss.damageXp), boss.maxHpXp);
  const leftPct = percent(hpLeft, boss.maxHpXp);
  const breakLeft = result.breakEndsAt - now;

  return (
    <Sheet labelledBy="break-title" onClose={onClose} className="break-sheet">
      <div className="break-hero">
        <div className="eyebrow">
          {solo ? "Solo session complete" : `Round ${result.round} complete`}
        </div>
        <h1 id="break-title">
          {solo ? "Nice work" : result.finisherIds.length > 1 ? "Nice work, everyone" : "Nice work"}
        </h1>
        {!solo && finishers.length > 0 && (
          <div className="stack">
            {finishers.slice(0, MAX_AVATARS).map((id) => (
              <Avatar key={id} userId={id} profile={profiles.get(id)} you={id === youId} />
            ))}
            <span className="stack-label">
              {result.finisherIds.length === 1
                ? "You finished the round"
                : `${result.finisherIds.length} finished together`}
            </span>
          </div>
        )}
      </div>

      <div className="stat-grid">
        {xpEnabled && (
          <div className="stat">
            <div className="stat-label">You earned</div>
            <div className="stat-value" style={{ color: "var(--teal-text)" }}>
              +{result.xpEarned} XP
            </div>
            <div className="stat-sub">
              {result.capped
                ? "Daily XP cap reached"
                : result.combo > 1 && result.baseXp > 0
                  ? `${result.baseXp} base × ${result.combo.toFixed(1)} combo`
                  : `${Math.floor(result.focusedMinutes)} minutes focused`}
            </div>
          </div>
        )}
        <div className="stat">
          <div className="stat-label">Streak</div>
          <div className="stat-value" style={{ color: "var(--flame)" }}>
            {result.streak} {result.streak === 1 ? "day" : "days"}
          </div>
          <div className="stat-sub">
            {result.finished ? "Today counts" : "Finish a full round to count today"}
          </div>
        </div>
      </div>

      {boss.enabled && result.bossOutcome === "finalBlow" && (
        <div className="break-panel boss-hit" data-outcome="finalBlow">
          <strong style={{ color: "var(--coral-text)", fontSize: 13 }}>
            Final blow! {solo ? "You" : "The room"} defeated {boss.name}
          </strong>
          <div className="tiny" style={{ color: "var(--boss-muted)" }}>
            {boss.lootXp > 0
              ? `Everyone who pitched in earned +${formatXp(boss.lootXp)} XP. A new boss spawns Monday.`
              : "A new boss spawns Monday."}
          </div>
        </div>
      )}
      {boss.enabled && result.bossOutcome === "hit" && !boss.defeated && (
        <div className="break-panel boss-hit" data-outcome="hit">
          <strong style={{ color: "var(--coral-text)", fontSize: 13 }}>
            {solo ? "You" : "The room"} hit {boss.name} for {formatXp(result.roomDamageXp)} XP
          </strong>
          <div className="bar" aria-hidden="true">
            <span style={{ width: `${leftPct}%`, background: "var(--coral)", borderRadius: 0 }} />
            <span
              style={{ width: `${hitPct}%`, background: "var(--coral-pale)", borderRadius: 0 }}
            />
          </div>
          <div className="tiny tabular" style={{ color: "var(--boss-muted)" }}>
            {`${hpText(boss)} HP left · ${percent(boss.damageXp, boss.maxHpXp)}% defeated`}
          </div>
        </div>
      )}

      {result.goalPrompt && (
        <div className="break-panel">
          <div style={{ fontSize: 14 }}>
            Did you finish <strong>{result.goalPrompt.text}</strong>?
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-teal"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => onGoalDone(result.goalPrompt!.id)}
            >
              {xpEnabled ? "Done, +25 XP" : "Done"}
            </button>
            <button type="button" className="btn btn-break" style={{ flex: 1 }} onClick={onClose}>
              Not yet
            </button>
          </div>
        </div>
      )}

      <div className="break-footer">
        <div style={{ flex: 1 }}>
          <div className="tiny" style={{ color: "var(--break-muted)" }}>
            {breakLeft > 0 ? "Break ends in" : "Break's over"}
          </div>
          <div className="break-countdown">
            {formatCountdown(breakLeft).replace(/^0(\d)/, "$1")}
          </div>
          {chatChannel && (
            <div className="tiny" style={{ color: "var(--break-muted)" }}>
              Say hi in #{chatChannel}
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn btn-break"
          style={{ color: "var(--teal-text)" }}
          onClick={onClose}
        >
          Back to the room
        </button>
      </div>
    </Sheet>
  );
}
