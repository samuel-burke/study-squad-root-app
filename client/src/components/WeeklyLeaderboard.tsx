import {
  formatHours,
  type LeaderboardDto,
  type LeaderboardEntryDto,
  type LeaderboardMetric,
  type LeaderboardPeriod,
} from "@studyroom/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { toGatewayError, type Profile, type StudyRoomGateway } from "../api/gateway";
import { useProfiles } from "../state/useProfiles";
import { Avatar } from "./Avatar";
import { OpenProfileButton } from "./MemberBoard";
import { Toggle } from "./Toggle";

const METRICS: { by: LeaderboardMetric; label: string }[] = [
  { by: "minutes", label: "Minutes" },
  { by: "xp", label: "XP" },
];

const PERIODS: {
  period: LeaderboardPeriod;
  label: string;
  title: string;
  resets: string;
  /** Finishes "…yet" and "Your 2 hrs…", so all time just leaves it off. */
  when: string;
}[] = [
  {
    period: "week",
    label: "Week",
    title: "This week",
    resets: "Resets Monday",
    when: " this week",
  },
  {
    period: "month",
    label: "Month",
    title: "This month",
    resets: "Resets on the 1st",
    when: " this month",
  },
  {
    period: "year",
    label: "Year",
    title: "This year",
    resets: "Resets January 1",
    when: " this year",
  },
  { period: "all", label: "All time", title: "All time", resets: "Never resets", when: "" },
];

const periodInfo = (period: LeaderboardPeriod) =>
  PERIODS.find((p) => p.period === period) ?? PERIODS[0]!;

const amount = (by: LeaderboardMetric, entry: Pick<LeaderboardEntryDto, "focusMinutes" | "xp">) =>
  by === "xp" ? `${entry.xp} XP` : formatHours(entry.focusMinutes);

/**
 * Standings for this week, month, year or all time, by focus minutes or XP,
 * with the member's own opt-out switch.
 */
export function WeeklyLeaderboard({
  gateway,
  onOpenMember,
  refreshKey,
}: {
  gateway: StudyRoomGateway;
  /** Opens a member's profile. */
  onOpenMember?(userId: string): void;
  /** Reloads quietly whenever this changes, such as on each room update while people focus. */
  refreshKey?: unknown;
}) {
  const [by, setBy] = useState<LeaderboardMetric>("minutes");
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [board, setBoard] = useState<LeaderboardDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [attempt, setAttempt] = useState(0);
  const youId = gateway.currentUserId();

  // The first load, a switch of metric or period and "Try again" are things the member
  // asked for, so their failures show. A refresh in the background keeps the
  // board on screen and tries again on the next update.
  const asked = useRef(true);
  useEffect(() => {
    let cancelled = false;
    gateway
      .getLeaderboard(by, period)
      .then((b) => {
        if (cancelled) return;
        asked.current = false;
        setBoard(b);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled && asked.current) setError(toGatewayError(e).message);
      });
    return () => {
      cancelled = true;
    };
  }, [gateway, attempt, by, period, refreshKey]);

  const userIds = useMemo(() => board?.entries.map((e) => e.userId) ?? [], [board]);
  const profiles = useProfiles(gateway, userIds);

  async function setShown(shown: boolean) {
    setSaving(true);
    setError(null);
    try {
      setBoard(await gateway.setLeaderboardHidden(!shown, by, period));
    } catch (e) {
      setError(toGatewayError(e).message);
    } finally {
      setSaving(false);
    }
  }

  // Until the new board arrives, the rows on screen still belong to the old one.
  const shownBy = board?.by ?? by;
  const shown = periodInfo(board?.period ?? period);
  const youListed = board?.entries.some((e) => e.userId === youId) ?? false;
  const pick = (change: () => void) => {
    asked.current = true;
    setError(null);
    change();
  };

  return (
    <section className="card" aria-label="Leaderboard">
      <div className="row-between">
        <h2 style={{ fontSize: 16 }}>{shown.title}</h2>
        <span className="tiny dim">{shown.resets}</span>
      </div>
      <div className="segmented" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            key={p.period}
            type="button"
            aria-pressed={period === p.period}
            onClick={() => p.period !== period && pick(() => setPeriod(p.period))}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="Rank by">
        {METRICS.map((m) => (
          <button
            key={m.by}
            type="button"
            aria-pressed={by === m.by}
            onClick={() => m.by !== by && pick(() => setBy(m.by))}
          >
            {m.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="small" role="alert" style={{ color: "var(--coral-text)" }}>
          {error}
        </div>
      )}
      {!board && !error && <div className="muted small">Loading…</div>}
      {error && (!board || board.by !== by || board.period !== period) && (
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => {
            asked.current = true;
            setError(null);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      )}

      {board && (
        <>
          {board.entries.length === 0 ? (
            <div className="small muted">
              {`${shownBy === "xp" ? "Nobody has earned XP" : "Nobody has focused"} yet${shown.when}. Start a timer!`}
            </div>
          ) : (
            <ol className="goal-list leaderboard" style={{ gap: 6 }}>
              {board.entries.map((entry) => (
                <LeaderboardRow
                  key={entry.userId}
                  by={shownBy}
                  entry={entry}
                  profile={profiles.get(entry.userId)}
                  you={entry.userId === youId}
                  onOpen={onOpenMember && (() => onOpenMember(entry.userId))}
                />
              ))}
              {!youListed && board.me.rank > 0 && (
                <LeaderboardRow
                  by={shownBy}
                  entry={{
                    userId: youId,
                    rank: board.me.rank,
                    focusMinutes: board.me.focusMinutes,
                    xp: board.me.xp,
                  }}
                  you
                  onOpen={onOpenMember && (() => onOpenMember(youId))}
                />
              )}
            </ol>
          )}
          {board.me.hidden && (
            <div className="small muted">
              {`You're hidden. Your ${amount(shownBy, board.me)}${shown.when} still count for you and the boss.`}
            </div>
          )}
          <div className="setting-row">
            <div>
              <div style={{ fontWeight: 700 }}>Show me on the leaderboard</div>
              <div className="hint">Also lists you in recap rankings</div>
            </div>
            <Toggle
              label="Show me on the leaderboard"
              checked={!board.me.hidden}
              disabled={saving}
              onChange={(shown) => void setShown(shown)}
            />
          </div>
        </>
      )}
    </section>
  );
}

function LeaderboardRow({
  by,
  entry,
  profile,
  you,
  onOpen,
}: {
  by: LeaderboardMetric;
  entry: LeaderboardEntryDto;
  profile?: Profile;
  you: boolean;
  onOpen?(): void;
}) {
  const name = you ? "You" : (profile?.name ?? "Member");
  const time = amount(by, entry);
  return (
    <li className="member-row" data-you={you} aria-label={`Rank ${entry.rank}, ${name}, ${time}`}>
      <OpenProfileButton name={name} onOpen={onOpen} />
      <span className="rank tabular" aria-hidden="true">
        {entry.rank}
      </span>
      <Avatar userId={entry.userId} profile={profile} you={you} />
      <div className="body" style={{ fontSize: 14, fontWeight: 700 }}>
        {name}
      </div>
      <div className="time">{time}</div>
    </li>
  );
}
