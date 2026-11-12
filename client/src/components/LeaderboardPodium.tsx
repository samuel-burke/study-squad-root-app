import { formatHours, type LeaderboardDto } from "@studyroom/core";
import { useEffect, useMemo, useState } from "react";
import type { StudyRoomGateway } from "../api/gateway";
import { useProfiles } from "../state/useProfiles";
import { Avatar } from "./Avatar";
import { TrophyIcon } from "./Icons";
import { OpenProfileButton } from "./MemberBoard";

/**
 * This week's top three by focus time, on the room screen, so the race is in
 * view while people study. A card on desktop, a one-line strip on phones.
 * Either one opens the full leaderboard.
 */
export function LeaderboardPodium({
  gateway,
  compact,
  onOpenLeaderboard,
  onOpenMember,
  refreshKey,
}: {
  gateway: StudyRoomGateway;
  compact: boolean;
  onOpenLeaderboard(): void;
  onOpenMember?(userId: string): void;
  /** Reloads quietly whenever this changes, such as on each room update while people focus. */
  refreshKey?: unknown;
}) {
  const [board, setBoard] = useState<LeaderboardDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    gateway
      .getLeaderboard("minutes", "week")
      .then((b) => {
        if (!cancelled) setBoard(b);
      })
      // The podium is a shortcut; if it can't load, the room carries on without it
      // and the next update tries again.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [gateway, refreshKey]);

  const top = useMemo(() => board?.entries.slice(0, 3) ?? [], [board]);
  const userIds = useMemo(() => top.map((e) => e.userId), [top]);
  const profiles = useProfiles(gateway, userIds);
  const youId = gateway.currentUserId();

  if (!board) return null;

  const nameOf = (userId: string) =>
    profiles.get(userId)?.name ?? (userId === youId ? "You" : "Member");
  const myRank = !board.me.hidden && board.me.rank > 0 ? board.me.rank : null;

  if (compact) {
    const summary =
      top.length === 0
        ? "Leaderboard. Nobody has focused yet this week."
        : `Leaderboard. This week's top ${top.length}: ${top.map((e) => nameOf(e.userId)).join(", ")}.` +
          (myRank ? ` You're number ${myRank}.` : "");
    return (
      <button
        type="button"
        className="podium-strip"
        aria-label={`${summary} Open the full leaderboard`}
        onClick={onOpenLeaderboard}
      >
        <TrophyIcon size={18} stroke="var(--amber-text)" />
        {top.length === 0 ? (
          <span className="small">Be first on this week&apos;s board</span>
        ) : (
          top.map((e) => (
            <span key={e.userId} className="podium-avatar">
              <Avatar userId={e.userId} profile={profiles.get(e.userId)} you={e.userId === youId} />
              <span className="podium-place" data-place={e.rank}>
                {e.rank}
              </span>
            </span>
          ))
        )}
        {myRank && <span className="podium-you">You #{myRank}</span>}
        <span className="podium-go">Leaderboard ›</span>
      </button>
    );
  }

  return (
    <section className="card" aria-label="Top of the leaderboard">
      <div className="row-between">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TrophyIcon size={18} stroke="var(--amber-text)" />
          <h2 className="podium-title">Race to the top</h2>
        </div>
        <span className="tiny dim">This week</span>
      </div>
      {top.length === 0 ? (
        <div className="small muted">Nobody has focused yet this week. Start a timer!</div>
      ) : (
        <ol className="goal-list leaderboard" style={{ gap: 6 }}>
          {top.map((e) => {
            const you = e.userId === youId;
            const name = nameOf(e.userId);
            const time = formatHours(e.focusMinutes);
            return (
              <li
                key={e.userId}
                className="member-row"
                data-you={you}
                aria-label={`Rank ${e.rank}, ${name}, ${time}`}
              >
                <OpenProfileButton
                  name={name}
                  you={you}
                  onOpen={onOpenMember && (() => onOpenMember(e.userId))}
                />
                <span className="podium-place" data-place={e.rank} aria-hidden="true">
                  {e.rank}
                </span>
                <Avatar userId={e.userId} profile={profiles.get(e.userId)} you={you} />
                <div className="body" style={{ fontSize: 14, fontWeight: 700 }}>
                  {name}
                </div>
                <div className="time">{time}</div>
              </li>
            );
          })}
        </ol>
      )}
      {myRank && myRank > 3 && (
        <div className="small muted">
          {`You're #${myRank} with ${formatHours(board.me.focusMinutes)} this week.`}
        </div>
      )}
      <button type="button" className="btn btn-quiet" onClick={onOpenLeaderboard}>
        See the full leaderboard
      </button>
    </section>
  );
}
