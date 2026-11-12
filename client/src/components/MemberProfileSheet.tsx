import { badgeById, type BadgeDefinition, type MemberProfileDto } from "@studyroom/core";
import { useEffect, useState } from "react";
import { toGatewayError, type StudyRoomGateway } from "../api/gateway";
import { useProfiles } from "../state/useProfiles";
import { Avatar } from "./Avatar";
import { BadgeMedal } from "./BadgeMedal";
import { FlameIcon } from "./Icons";
import { XpBar } from "./SessionPanel";
import { Sheet } from "./Sheet";

/**
 * A member's profile, opened by tapping them on the board or the leaderboard:
 * level, XP, streak and the badges they've earned. Only game stats; their
 * goals and focus history stay private.
 */
export function MemberProfileSheet({
  gateway,
  userId,
  you,
  xpEnabled,
  onClose,
}: {
  gateway: StudyRoomGateway;
  userId: string;
  you: boolean;
  xpEnabled: boolean;
  onClose(): void;
}) {
  const [profile, setProfile] = useState<MemberProfileDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const names = useProfiles(gateway, [userId]);
  const name = names.get(userId)?.name ?? (you ? "You" : "Member");

  useEffect(() => {
    let cancelled = false;
    gateway
      .getMemberProfile(userId)
      .then((p) => !cancelled && setProfile(p))
      .catch((e: unknown) => !cancelled && setError(toGatewayError(e).message));
    return () => {
      cancelled = true;
    };
  }, [gateway, userId]);

  return (
    <Sheet labelledBy="member-profile-title" onClose={onClose} className="profile-sheet">
      <div className="profile-head">
        <Avatar userId={userId} profile={names.get(userId)} you={you} />
        <div style={{ minWidth: 0 }}>
          <h1 id="member-profile-title" className="profile-name">
            {name}
          </h1>
          {you && <div className="small muted">This is what others see when they tap you</div>}
        </div>
      </div>

      {error && (
        <div className="small" role="alert" style={{ color: "var(--coral-text)" }}>
          {error}
        </div>
      )}
      {!profile && !error && <div className="muted small">Loading…</div>}
      {profile && (
        <>
          <ProfileStats profile={profile} xpEnabled={xpEnabled} />
          <ProfileBadges
            profile={profile}
            you={you}
            selected={selected}
            onSelect={(id) => setSelected(selected === id ? null : id)}
          />
        </>
      )}

      <button type="button" className="btn" onClick={onClose} data-autofocus>
        Close
      </button>
    </Sheet>
  );
}

function ProfileStats({ profile, xpEnabled }: { profile: MemberProfileDto; xpEnabled: boolean }) {
  return (
    <section className="profile-stats" aria-label="Stats">
      {xpEnabled ? (
        <div className="profile-level">
          <div className="level-badge" aria-hidden="true">
            <small>LEVEL</small>
            <strong>{profile.level}</strong>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <XpBar me={profile} />
            <div className="tiny dim tabular" style={{ marginTop: 6 }}>
              {profile.xpTotal.toLocaleString()} XP total
            </div>
          </div>
        </div>
      ) : (
        <div className="profile-level">
          <span className="level-chip">Lv {profile.level}</span>
        </div>
      )}
      <div className="profile-streak">
        <FlameIcon size={18} stroke="var(--flame)" />
        <span>{profile.streak} day streak</span>
      </div>
    </section>
  );
}

function ProfileBadges({
  profile,
  you,
  selected,
  onSelect,
}: {
  profile: MemberProfileDto;
  you: boolean;
  selected: string | null;
  onSelect(id: string): void;
}) {
  const earned = profile.badges
    .map((b) => ({ badge: badgeById(b.id), earnedAt: b.earnedAt }))
    .filter((b): b is { badge: BadgeDefinition; earnedAt: number } => b.badge !== undefined)
    .reverse();
  const showcase = profile.showcase.flatMap((id) => badgeById(id) ?? []);
  const detail = earned.find((b) => b.badge.id === selected);

  return (
    <section className="profile-badges" aria-label="Badges">
      <div className="row-between">
        <h2 style={{ fontSize: 16 }}>Badges</h2>
        <span className="tiny dim tabular">{earned.length} earned</span>
      </div>

      {showcase.length > 0 && (
        <div className="showcase-badges" aria-label={you ? "On your card" : "On their card"}>
          {showcase.map((badge) => (
            <span key={badge.id} className="badge-pill">
              <BadgeMedal badge={badge} size={22} />
              {badge.name}
            </span>
          ))}
        </div>
      )}

      {earned.length === 0 ? (
        <div className="small muted">No badges yet.</div>
      ) : (
        <ul className="badge-grid">
          {earned.map(({ badge }) => (
            <li key={badge.id}>
              <button
                type="button"
                className="badge-tile"
                data-earned="true"
                data-secret={badge.secret === true}
                aria-pressed={selected === badge.id}
                aria-label={badge.name}
                onClick={() => onSelect(badge.id)}
              >
                <BadgeMedal badge={badge} size={44} />
                <span className="badge-name">{badge.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {detail && (
        <div className="badge-detail" role="region" aria-label="Badge details">
          <div className="badge-detail-head">
            <BadgeMedal badge={detail.badge} size={44} />
            <strong>{detail.badge.name}</strong>
          </div>
          {/* Someone else's secret badge doesn't give away how to find it. */}
          <span className="small muted">
            {detail.badge.secret && !you
              ? "A secret badge. Nobody tells you how to get these."
              : detail.badge.description}
          </span>
          <span className="small dim">Earned {earnedDate(detail.earnedAt)}</span>
        </div>
      )}
    </section>
  );
}

const earnedDate = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
