import {
  badgeById,
  formatCountdown,
  MAIN_TABLE_ID,
  type MemberCardDto,
  type TableDto,
} from "@studyroom/core";
import type { ReactNode } from "react";
import type { Profile } from "../api/gateway";
import { isFocusing, phasePill, rowTime, statusChip, tableName } from "../lib/view";
import { Avatar } from "./Avatar";
import { BreakMarks, HighFiveButtons, onBreak } from "./BreakFun";
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
  /** Set while you're on a break, so you can high-five teammates on one too. */
  highFive?: HighFiveProps;
  /** Running tables. With more than the main one, the board is split by table. */
  tables?: TableDto[];
  /** The table you sit at, if any. */
  myTableId?: string;
  busy?: boolean;
  onJoinTable?(tableId: string): void;
  onNewTable?(): void;
}

export interface HighFiveProps {
  busy: boolean;
  onSend(userId: string, emoji: string): void;
}

/** High-five buttons for a teammate who is on a break, when you're on one too. */
function HighFiveFor({
  member,
  name,
  you,
  highFive,
}: {
  member: MemberCardDto;
  name: string;
  you: boolean;
  highFive?: HighFiveProps;
}) {
  if (!highFive || you || !onBreak(member.status)) return null;
  return (
    <HighFiveButtons
      name={name}
      busy={highFive.busy}
      onSend={(emoji) => highFive.onSend(member.userId, emoji)}
    />
  );
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

interface MemberProps {
  member: MemberCardDto;
  profile?: Profile;
  you: boolean;
  voice: boolean;
  now: number;
  /** Names of the tables other than the main one, for the status chip. */
  tables: ReadonlyMap<string, string>;
  onOpen?(): void;
  highFive?: HighFiveProps;
}

function MemberCard({ member, profile, you, voice, now, tables, onOpen, highFive }: MemberProps) {
  const chip = statusChip(member, now, tables);
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
      <div className="member-break">
        <BreakMarks member={member} />
        <HighFiveFor member={member} name={name} you={you} highFive={highFive} />
      </div>
    </li>
  );
}

function MemberRow({ member, profile, you, voice, now, tables, onOpen, highFive }: MemberProps) {
  const chip = statusChip(member, now, tables);
  const name = profile?.name ?? (you ? "You" : "Member");
  const label = `${name}, ${chip.label}${voice ? ", in voice" : ""}`;
  const goal = goalText(member) ?? (member.goalPrivate ? "Focusing (private)" : "Focusing");
  const time = rowTime(member, now, tables);
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
        <div className="goal-line">
          <BreakMarks member={member} />
          {goal}
        </div>
      </div>
      <HighFiveFor member={member} name={name} you={you} highFive={highFive} />
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
  highFive,
  tables = [],
  myTableId = "",
  busy,
  onJoinTable,
  onNewTable,
}: BoardProps) {
  const voice = new Set(inVoice);
  const focusing = members.filter(isFocusing).length;
  const onBreak = members.length - focusing;
  const names = new Map(tables.filter((t) => t.id !== MAIN_TABLE_ID).map((t) => [t.id, t.name]));
  const Item = compact ? MemberRow : MemberCard;
  const list = (people: MemberCardDto[]) => (
    <ul className={compact ? "goal-list" : "board"} style={compact ? { gap: 8 } : undefined}>
      {orderMembers(people, youId).map((m) => (
        <Item
          key={m.userId}
          member={m}
          profile={profiles.get(m.userId)}
          you={m.userId === youId}
          voice={voice.has(m.userId)}
          now={now}
          tables={names}
          onOpen={onOpenMember && (() => onOpenMember(m.userId))}
          highFive={highFive}
        />
      ))}
    </ul>
  );
  const newTable = onNewTable && (
    <button type="button" className="btn btn-quiet btn-sm" onClick={onNewTable} disabled={busy}>
      + New table
    </button>
  );

  // Only the main table running: one board, as before tables existed.
  let body: ReactNode = members.length === 0 ? <EmptyBoard /> : list(members);
  if (tables.some((t) => t.id !== MAIN_TABLE_ID)) {
    const solo = members.filter((m) => !m.tableId);
    body = (
      <>
        {/* Your table first. Colours stay with each table's place in the room. */}
        {tables
          .map((table, i) => ({ table, i }))
          .sort((a, b) => Number(b.table.id === myTableId) - Number(a.table.id === myTableId))
          .map(({ table, i }) => {
            const mine = table.id === myTableId;
            const { timer } = table;
            return (
              <section key={table.id} className="table-section" aria-label={tableName(table)}>
                <div className="table-head">
                  <span className="table-dot" data-color={i % 4} />
                  <h3>{tableName(table)}</h3>
                  <span className="small muted">
                    {compact ? "" : `${phasePill(timer)} · `}
                    {formatCountdown(timer.phaseEndsAt - now)}
                  </span>
                  <span style={{ flex: 1 }} />
                  {mine ? (
                    <span className="table-you">Your table</span>
                  ) : (
                    onJoinTable && (
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={() => onJoinTable(table.id)}
                        disabled={busy}
                      >
                        Sit here
                      </button>
                    )
                  )}
                </div>
                {list(members.filter((m) => m.tableId === table.id))}
              </section>
            );
          })}
        {solo.length > 0 && (
          <section className="table-section" aria-label="Solo timers">
            <div className="table-head">
              <h3>Solo</h3>
              <span className="small muted">Own timer, not in the combo</span>
            </div>
            {list(solo)}
          </section>
        )}
      </>
    );
  }

  return (
    <section
      aria-label="Who is in the room"
      className={compact ? "mobile-board" : undefined}
      style={compact ? undefined : { display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div className="board-head">
        <h2>Focusing now · {focusing}</h2>
        {!compact && onBreak > 0 && <div className="small muted">{onBreak} on break</div>}
        {newTable}
      </div>
      {body}
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
