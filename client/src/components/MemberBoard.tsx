import { badgeById, type MemberCardDto } from "@studyroom/core";
import type { Profile } from "../api/gateway";
import { isFocusing, rowTime, statusChip } from "../lib/view";
import { Avatar } from "./Avatar";
import { BadgeMedal } from "./BadgeMedal";
import { FlameIcon, LockIcon } from "./Icons";
import { InVoiceMark } from "./VoiceButton";

interface BoardProps {
  members: MemberCardDto[];
  /** Members in the community voice channel. */
  inVoice?: readonly string[];
  profiles: Map<string, Profile>;
  youId: string;
  now: number;
  compact?: boolean;
  /** Opens a member's profile. */
  onOpenMember?(userId: string): void;
}

/** You first, then everyone else in the order they started. */
export function orderMembers(members: MemberCardDto[], youId: string): MemberCardDto[] {
  return [
    ...members.filter((m) => m.userId === youId),
    ...members.filter((m) => m.userId !== youId),
  ];
}

function goalText(member: MemberCardDto) {
  if (member.goalPrivate) return null;
  return member.goalText || null;
}

/** Covers a card so tapping anywhere on it opens the member's profile. */
export function OpenProfileButton({
  name,
  you = name === "You",
  onOpen,
}: {
  name: string;
  you?: boolean;
  onOpen?(): void;
}) {
  if (!onOpen) return null;
  return (
    <button
      type="button"
      className="open-profile"
      aria-label={you ? "View your profile" : `View ${name}'s profile`}
      onClick={onOpen}
    />
  );
}

/**
 * The one badge a member features on the board: their first pin, or their
 * newest. The rest live on their progress screen.
 */
function FeaturedBadge({ ids }: { ids: string[] }) {
  const badge = ids.map(badgeById).find((b) => b !== undefined);
  if (!badge) return null;
  return (
    <span
      className="featured-badge"
      title={badge.name}
      role="img"
      aria-label={`Badge: ${badge.name}`}
    >
      <BadgeMedal badge={badge} size={22} />
    </span>
  );
}

/** The member's place on this week's leaderboard. Nothing when unranked or hidden. */
export function RankChip({ rank }: { rank: number }) {
  if (rank <= 0) return null;
  return (
    <span
      className="rank-chip"
      data-top={rank <= 3}
      role="img"
      aria-label={`#${rank} on this week's leaderboard`}
      title={`#${rank} on this week's leaderboard`}
    >
      #{rank}
    </span>
  );
}

function MemberCard({
  member,
  profile,
  you,
  voice,
  now,
  onOpen,
}: {
  member: MemberCardDto;
  profile?: Profile;
  you: boolean;
  voice: boolean;
  now: number;
  onOpen?(): void;
}) {
  const chip = statusChip(member, now);
  const name = profile?.name ?? (you ? "You" : "Member");
  const label = `${name}, ${chip.label}${voice ? ", in voice" : ""}`;
  const goal = goalText(member);
  return (
    <li className="member-card" data-you={you} data-style={member.cardStyle} aria-label={label}>
      <OpenProfileButton name={name} you={you} onOpen={onOpen} />
      <div className="member-top">
        <Avatar userId={member.userId} profile={profile} you={you} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="member-name">
            <span className="name">{name}</span>
            <span className="level-chip">Lv {member.level}</span>
            {voice && <InVoiceMark />}
            <FeaturedBadge ids={member.badges} />
          </div>
          <div className="streak-line">
            <FlameIcon size={13} stroke="var(--flame)" />
            {member.streak} day streak
            <RankChip rank={member.weeklyRank} />
          </div>
        </div>
      </div>
      {goal ? (
        <div className="member-goal" title={goal}>
          {goal}
        </div>
      ) : (
        <div className="member-goal private">
          {member.goalPrivate && <LockIcon size={14} />}
          Focusing
        </div>
      )}
      <div className="member-foot">
        <div className="chip" data-tone={chip.tone}>
          <span className="dot" />
          {chip.label}
        </div>
      </div>
    </li>
  );
}

function MemberRow({
  member,
  profile,
  you,
  voice,
  now,
  onOpen,
}: {
  member: MemberCardDto;
  profile?: Profile;
  you: boolean;
  voice: boolean;
  now: number;
  onOpen?(): void;
}) {
  const chip = statusChip(member, now);
  const name = profile?.name ?? (you ? "You" : "Member");
  const label = `${name}, ${chip.label}${voice ? ", in voice" : ""}`;
  const goal = goalText(member) ?? (member.goalPrivate ? "Focusing (private)" : "Focusing");
  const time = rowTime(member, now);
  return (
    <li className="member-row" data-style={member.cardStyle} aria-label={label}>
      <OpenProfileButton name={name} you={you} onOpen={onOpen} />
      <Avatar userId={member.userId} profile={profile} you={you} />
      <div className="body">
        <div
          style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}
        >
          {name}
          <RankChip rank={member.weeklyRank} />
          {voice && <InVoiceMark />}
          <FeaturedBadge ids={member.badges} />
        </div>
        <div className="goal-line">{goal}</div>
      </div>
      <div className="time" data-tone={chip.tone}>
        {time}
      </div>
    </li>
  );
}

export function MemberBoard({
  members,
  inVoice = [],
  profiles,
  youId,
  now,
  compact,
  onOpenMember,
}: BoardProps) {
  const ordered = orderMembers(members, youId);
  const voice = new Set(inVoice);
  const focusing = members.filter(isFocusing).length;
  const onBreak = members.length - focusing;

  if (compact) {
    return (
      <section aria-label="Who is in the room" className="mobile-board">
        <h2>Focusing now · {focusing}</h2>
        <ul className="goal-list" style={{ gap: 8 }}>
          {ordered.map((m) => (
            <MemberRow
              key={m.userId}
              member={m}
              profile={profiles.get(m.userId)}
              you={m.userId === youId}
              voice={voice.has(m.userId)}
              now={now}
              onOpen={onOpenMember && (() => onOpenMember(m.userId))}
            />
          ))}
        </ul>
        {members.length === 0 && <EmptyBoard />}
      </section>
    );
  }

  return (
    <section
      aria-label="Who is in the room"
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div className="board-head">
        <h2>Focusing now · {focusing}</h2>
        {onBreak > 0 && <div className="small muted">{onBreak} on break</div>}
      </div>
      {members.length === 0 ? (
        <EmptyBoard />
      ) : (
        <ul className="board">
          {ordered.map((m) => (
            <MemberCard
              key={m.userId}
              member={m}
              profile={profiles.get(m.userId)}
              you={m.userId === youId}
              voice={voice.has(m.userId)}
              now={now}
              onOpen={onOpenMember && (() => onOpenMember(m.userId))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyBoard() {
  return (
    <div className="empty-board">
      The room is quiet. Start a timer and you'll be the first card on the board.
    </div>
  );
}
