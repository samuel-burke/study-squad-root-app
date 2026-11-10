import { formatHours, type ProgressDto, type QuestDto } from "@studyroom/core";
import { useEffect, useRef, useState } from "react";
import { toGatewayError, type StudyRoomGateway } from "../api/gateway";
import { freezeDays, heatLevel, percent } from "../lib/view";
import { BadgeShelf, CardStylePicker } from "./BadgeShelf";
import { BackIcon, FlameIcon } from "./Icons";
import { XpBar } from "./SessionPanel";
import { WeeklyLeaderboard } from "./WeeklyLeaderboard";

/** Heatmap rows are Monday-to-Sunday weeks, ending with this week. */
const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/** The leaderboard first, then level, streak with freeze status, a five-week heatmap, weekly quests, badges and card style. */
export function ProgressScreen({
  gateway,
  xpEnabled,
  freezesEnabled,
  onBack,
  onDeleteData,
  onOpenMember,
  onReplayBadge,
  refreshKey,
}: {
  gateway: StudyRoomGateway;
  xpEnabled: boolean;
  freezesEnabled: boolean;
  onBack(): void;
  /** Resolves true once the server has erased the member's data. */
  onDeleteData(): Promise<boolean>;
  /** Opens a member's profile from the leaderboard. */
  onOpenMember?(userId: string): void;
  /** Plays an earned badge's unlock moment again. */
  onReplayBadge?(badgeId: string): void;
  /** Reloads quietly whenever this changes, such as on each room update while people focus. */
  refreshKey?: unknown;
}) {
  const [progress, setProgress] = useState<ProgressDto | null>(null);
  const loaded = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The leaderboard loads on its own. Both wait for each other so the stats don't
  // pop in under an already-drawn board while the member is reading it.
  const [boardSettled, setBoardSettled] = useState(false);
  const ready = (progress !== null || error !== null) && boardSettled;
  const frozen =
    progress && freezesEnabled ? freezeDays(progress.days, progress.me.streak) : new Set<string>();

  async function save(work: () => Promise<ProgressDto>) {
    setSaving(true);
    setError(null);
    try {
      setProgress(await work());
    } catch (e) {
      setError(toGatewayError(e).message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    gateway
      .getProgress()
      .then((p) => {
        if (cancelled) return;
        loaded.current = true;
        setProgress(p);
      })
      .catch((e: unknown) => {
        // A failed background refresh keeps what's on screen; the next update tries again.
        if (!cancelled && !loaded.current) setError(toGatewayError(e).message);
      });
    return () => {
      cancelled = true;
    };
  }, [gateway, refreshKey]);

  return (
    <main className="progress-page">
      <header className="progress-header">
        <button
          type="button"
          className="icon-btn ghost"
          aria-label="Back to the room"
          onClick={onBack}
          style={{ marginLeft: -8 }}
        >
          <BackIcon size={20} />
        </button>
        <h1 style={{ fontSize: 20 }}>Your progress</h1>
      </header>

      {!ready && <div className="muted">Loading…</div>}

      {/* The race comes first. Mounted from the start so it loads alongside the stats,
          but kept out of sight until both are in. */}
      <div className="progress-stack" hidden={!ready}>
        <WeeklyLeaderboard
          gateway={gateway}
          onOpenMember={onOpenMember}
          refreshKey={refreshKey}
          onSettled={() => setBoardSettled(true)}
        />
      </div>

      {ready && error && (
        <div className="toast" role="alert" style={{ position: "static", transform: "none" }}>
          {error}
        </div>
      )}
      {ready && progress && (
        <>
          {xpEnabled && (
            <section
              className="card"
              style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
            >
              <div className="level-badge" aria-hidden="true">
                <small>LEVEL</small>
                <strong>{progress.me.level}</strong>
              </div>
              <div style={{ flex: 1 }}>
                <XpBar me={progress.me} />
              </div>
            </section>
          )}

          <section className="card" aria-label="Streak">
            <div className="row-between">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <FlameIcon size={20} stroke="var(--flame)" />
                <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700 }}>
                  {progress.me.streak} day streak
                </span>
              </div>
              {/* Nothing to protect at 0, so no freeze status either. */}
              {freezesEnabled && progress.me.streak > 0 && (
                <span className="freeze-chip">
                  {progress.me.freezeAvailable ? "1 freeze left" : "Freeze used this week"}
                </span>
              )}
            </div>
            <div className="heatmap heat-weekdays" aria-hidden="true">
              {WEEKDAY_LETTERS.map((letter, i) => (
                <span key={i}>{letter}</span>
              ))}
            </div>
            <ol className="heatmap" aria-label="Focus time, last 5 weeks">
              {progress.days.map((d, i) => {
                const isFrozen = frozen.has(d.day);
                const label = `${d.day}: ${isFrozen ? "covered by a freeze" : formatHours(d.focusMinutes)}`;
                return (
                  <li
                    key={d.day}
                    className={[
                      "heat",
                      isFrozen && "heat-frozen",
                      i === progress.days.length - 1 && "heat-today",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-level={heatLevel(d.focusMinutes)}
                    title={label}
                    aria-label={label}
                  />
                );
              })}
              {Array.from({ length: (7 - (progress.days.length % 7)) % 7 }, (_, i) => (
                <li key={`later-${i}`} className="heat heat-later" aria-hidden="true" />
              ))}
            </ol>
            <div className="row-between tiny dim">
              <span>
                Last 5 weeks
                {frozen.size > 0 && (
                  <>
                    {" · "}
                    <span className="heat-key" aria-hidden="true" /> freeze
                  </>
                )}
              </span>
              <span>{formatHours(progress.totalFocusMinutes)} total</span>
            </div>
          </section>

          {progress.quests.length > 0 && <WeeklyQuests quests={progress.quests} />}
          <BadgeShelf
            earned={progress.badges}
            card={progress.card}
            busy={saving}
            onShowcase={(ids) => void save(() => gateway.setBadgeShowcase(ids))}
            onReplay={onReplayBadge}
          />
          <CardStylePicker
            level={progress.me.level}
            earned={progress.badges}
            card={progress.card}
            busy={saving}
            onPick={(style) => void save(() => gateway.setCardStyle(style))}
          />
        </>
      )}

      {ready && <DeleteMyData onDelete={onDeleteData} onDone={onBack} />}
    </main>
  );
}

const questAmount = (quest: QuestDto, value: number) =>
  quest.unit === "minutes" ? formatHours(value) : String(value);

function WeeklyQuests({ quests }: { quests: QuestDto[] }) {
  return (
    <section className="card" aria-label="Weekly quests">
      <div className="row-between">
        <h2 style={{ fontSize: 16 }}>Weekly quests</h2>
        <span className="tiny dim">Resets Monday</span>
      </div>
      <ul className="quests">
        {quests.map((quest) => (
          <li key={quest.id} className="quest" data-done={quest.done}>
            <div className="row-between small">
              <span>{quest.title}</span>
              <span className="muted tabular">
                {questAmount(quest, quest.progress)} / {questAmount(quest, quest.target)}
                {quest.done ? (
                  <strong className="quest-reward"> · Done</strong>
                ) : (
                  quest.xp > 0 && <strong className="quest-reward"> · +{quest.xp} XP</strong>
                )}
              </span>
            </div>
            <div
              className="bar"
              role="progressbar"
              aria-label={quest.title}
              aria-valuemin={0}
              aria-valuemax={quest.target}
              aria-valuenow={quest.progress}
            >
              <span style={{ width: `${percent(quest.progress, quest.target)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Two-step erase, because it can't be undone. */
function DeleteMyData({ onDelete, onDone }: { onDelete(): Promise<boolean>; onDone(): void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function erase() {
    setBusy(true);
    const ok = await onDelete();
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <section className="card" aria-label="Your data">
      <h2 style={{ fontSize: 16 }}>Your data</h2>
      <div className="small muted">
        Study Squad keeps your goals, sessions, XP and streak so your progress is here next time.
        You can erase all of it at any time.
      </div>
      {confirming ? (
        <div
          role="alertdialog"
          aria-label="Confirm delete"
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          <div className="small">
            This erases your goals, session history, XP, level, streak and badges for this
            community. It can&apos;t be undone.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-danger"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => void erase()}
            >
              Delete everything
            </button>
            <button
              type="button"
              className="btn"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-quiet" onClick={() => setConfirming(true)}>
          Delete my data
        </button>
      )}
    </section>
  );
}
