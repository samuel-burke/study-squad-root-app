import type { MyStatusDto, RoomStateDto } from "@studyroom/core";
import { useState, type ReactNode } from "react";
import type { Profile } from "../api/gateway";
import { phasePill } from "../lib/view";
import { BossCard, MobileBoss } from "./BossCard";
import { BreakChallengeCard, myBreakKey } from "./BreakFun";
import { ComboCard, ComboPill } from "./ComboCard";
import type { GoalActions } from "./GoalList";
import { AppLogo, ChartIcon, PeopleIcon, SlidersIcon, SoundOffIcon, SoundOnIcon } from "./Icons";
import { MemberBoard } from "./MemberBoard";
import { SessionPanel } from "./SessionPanel";
import { TimerCard } from "./TimerCard";
import { VoiceButton } from "./VoiceButton";

export interface RoomScreenProps {
  room: RoomStateDto;
  me: MyStatusDto;
  profiles: Map<string, Profile>;
  now: number;
  busy: boolean;
  compact: boolean;
  soundsMuted: boolean;
  onToggleSounds(): void;
  onStart(mode: "room" | "solo"): void;
  onLeave(): void;
  onEndSolo(): void;
  goalActions: GoalActions;
  onOpenGoals(): void;
  onOpenProgress(): void;
  onOpenSettings(): void;
  onOpenMember(userId: string): void;
  onChallengeDone(): void;
  /** Resolves true once the high-five went through. */
  onHighFive(userId: string, emoji: string): Promise<boolean>;
  /** This week's top three, which opens the full leaderboard. */
  podium?: ReactNode;
}

function Header({
  room,
  compact,
  soundsMuted,
  onToggleSounds,
  onOpenProgress,
  onOpenSettings,
}: Pick<
  RoomScreenProps,
  "room" | "compact" | "soundsMuted" | "onToggleSounds" | "onOpenProgress" | "onOpenSettings"
>) {
  const channel = room.features.postChannelName;
  return (
    <header className="app-header">
      {compact ? (
        // Phones only have room for the logo next to the round pill.
        <div className="brand brand-compact">
          <div className="brand-mark" role="img" aria-label="Study Squad">
            <AppLogo size={32} />
          </div>
        </div>
      ) : (
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <AppLogo size={32} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="brand-name">Study Squad</div>
            {channel && <div className="brand-sub">Posts in #{channel}</div>}
          </div>
        </div>
      )}
      <div className="phase-pill" data-phase={room.timer.phase}>
        <span className="dot" />
        {compact && room.timer.phase !== "idle" && room.timer.phase !== "longBreak"
          ? `Round ${room.timer.round} of ${room.timer.rounds}`
          : phasePill(room.timer)}
      </div>
      <div className="header-meta">
        <div className="present">
          <PeopleIcon />
          {room.presentCount} in the room
        </div>
        <VoiceButton voice={room.voice} compact={compact} />
        <button
          type="button"
          className="icon-btn"
          aria-label="Sound effects"
          aria-pressed={!soundsMuted}
          title={soundsMuted ? "Sounds off" : "Sounds on"}
          onClick={onToggleSounds}
        >
          {soundsMuted ? <SoundOffIcon size={18} /> : <SoundOnIcon size={18} />}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Your progress"
          onClick={onOpenProgress}
        >
          <ChartIcon size={18} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Room settings"
          onClick={onOpenSettings}
        >
          <SlidersIcon size={18} />
        </button>
      </div>
    </header>
  );
}

export function RoomScreen(props: RoomScreenProps) {
  const { room, me, profiles, now, busy, compact } = props;
  const inSession = me.status !== "idle";
  const breakKey = myBreakKey(room, me);
  // Who you high-fived, for the break you're on. A new break starts it fresh.
  const [sent, setSent] = useState<{ key: string | null; ids: ReadonlySet<string> }>({
    key: null,
    ids: new Set(),
  });
  const sentIds = sent.key === breakKey ? sent.ids : new Set<string>();
  const highFive = breakKey
    ? {
        sent: sentIds,
        busy,
        onSend: (userId: string, emoji: string) => {
          void props.onHighFive(userId, emoji).then((ok) => {
            if (ok) setSent({ key: breakKey, ids: new Set([...sentIds, userId]) });
          });
        },
      }
    : undefined;
  const challenge = (
    <BreakChallengeCard room={room} me={me} busy={busy} onDone={props.onChallengeDone} />
  );
  const timer = (
    <TimerCard
      room={room}
      me={me}
      now={now}
      busy={busy}
      compact={compact}
      onJoin={() => props.onStart("room")}
      onLeave={props.onLeave}
      onSolo={() => props.onStart("solo")}
      onEndSolo={props.onEndSolo}
    />
  );
  const board = (
    <MemberBoard
      members={room.members}
      inVoice={room.voice.userIds}
      profiles={profiles}
      youId={me.userId}
      now={now}
      compact={compact}
      onOpenMember={props.onOpenMember}
      highFive={highFive}
    />
  );

  if (compact) {
    const open = me.goals.filter((g) => !g.done).length;
    const done = me.goals.length - open;
    return (
      <div className="app">
        <Header {...props} />
        {room.boss.enabled && <MobileBoss boss={room.boss} />}
        {timer}
        {challenge}
        {props.podium}
        {room.features.comboEnabled && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <ComboPill combo={room.combo} participants={room.roomParticipantCount} />
          </div>
        )}
        {board}
        <nav className="bottom-bar" aria-label="Session">
          <button type="button" className="btn btn-secondary" onClick={props.onOpenGoals}>
            Goals · {done} of {me.goals.length}
          </button>
          {me.onRoomTimer ? (
            <button type="button" className="btn" onClick={props.onLeave} disabled={busy}>
              Leave timer
            </button>
          ) : me.status === "soloFocus" || me.status === "soloBreak" ? (
            <button type="button" className="btn" onClick={props.onEndSolo} disabled={busy}>
              {me.status === "soloBreak" ? "Skip break" : "End solo"}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => props.onStart("room")}
              disabled={busy || inSession}
            >
              Start focusing
            </button>
          )}
        </nav>
      </div>
    );
  }

  return (
    <div className="app">
      <Header {...props} />
      <div className="room-body">
        <main className="room-main">
          {timer}
          {challenge}
          {board}
        </main>
        <aside className="room-aside">
          {props.podium}
          {room.boss.enabled && <BossCard boss={room.boss} combo={room.combo} now={now} />}
          {room.features.comboEnabled && (
            <ComboCard combo={room.combo} participants={room.roomParticipantCount} />
          )}
          <SessionPanel
            me={me}
            xpEnabled={room.features.xpEnabled}
            busy={busy}
            goalActions={props.goalActions}
          />
        </aside>
      </div>
    </div>
  );
}
