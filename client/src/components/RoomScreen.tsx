import type { MyStatusDto, RoomStateDto } from "@studyroom/core";
import type { ReactNode } from "react";
import type { Profile } from "../api/gateway";
import { BossCard, MobileBoss } from "./BossCard";
import { BreakChallengeCard, myBreakKey } from "./BreakFun";
import type { GoalActions } from "./GoalList";
import { phasePill } from "../lib/view";
import { AppLogo, ChartIcon, SlidersIcon, SoundOffIcon, SoundOnIcon } from "./Icons";
import { MemberBoard } from "./MemberBoard";
import { SessionPanel } from "./SessionPanel";
import { TimerCard } from "./TimerCard";
import { VoiceButton } from "./VoiceButton";
import { KeepGoing } from "./KeepGoing";

export interface RoomScreenProps {
  room: RoomStateDto;
  me: MyStatusDto;
  profiles: Map<string, Profile>;
  now: number;
  busy: boolean;
  compact: boolean;
  soundsMuted: boolean;
  ambientOn: boolean;
  onOpenSounds(): void;
  onStart(mode: "room" | "solo"): void;
  onLeave(): void;
  onKeepGoing(): void;
  onEndSolo(): void;
  goalActions: GoalActions;
  onOpenGoals(): void;
  onOpenProgress(): void;
  onOpenSettings(): void;
  onOpenMember(userId: string): void;
  onChallengeDone(): void;
  /** Resolves true once the high-five went through. */
  onHighFive(userId: string, emoji: string): Promise<boolean>;
  onJoinTable(tableId: string): void;
  /** This week's top three, which opens the full leaderboard. */
  podium?: ReactNode;
  /** Shows the playing track under the timer. */
  miniPlayer?: ReactNode;
}

function Header({
  room,
  me,
  compact,
  soundsMuted,
  ambientOn,
  onOpenSounds,
  onOpenProgress,
  onOpenSettings,
}: Pick<
  RoomScreenProps,
  | "room"
  | "me"
  | "compact"
  | "soundsMuted"
  | "ambientOn"
  | "onOpenSounds"
  | "onOpenProgress"
  | "onOpenSettings"
>) {
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
          <div className="brand-name">Study Squad</div>
        </div>
      )}
      {compact && (
        // Phones have no round dots, so the round lives here.
        <div className="phase-pill" data-phase={room.timer.phase} data-dim={!me.onRoomTimer}>
          <span className="dot" />
          {room.timer.phase === "longBreak"
            ? phasePill(room.timer)
            : room.timer.phase === "idle"
              ? "Timer free"
              : `Round ${room.timer.round} of ${room.timer.rounds}`}
        </div>
      )}
      <div className="header-meta">
        <VoiceButton voice={room.voice} compact={compact} />
        <button
          type="button"
          className="icon-btn"
          aria-label="Sounds"
          aria-keyshortcuts="M"
          aria-haspopup="dialog"
          title={ambientOn ? "Background sound on" : soundsMuted ? "Sounds off" : "Sounds on"}
          onClick={onOpenSounds}
        >
          {soundsMuted && !ambientOn ? <SoundOffIcon size={18} /> : <SoundOnIcon size={18} />}
          {ambientOn && <span className="sound-on" aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Your progress"
          aria-keyshortcuts="P"
          title="Your progress (P)"
          onClick={onOpenProgress}
        >
          <ChartIcon size={18} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Room settings"
          aria-keyshortcuts=","
          title="Room settings (,)"
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
  const breakKey = myBreakKey(room, me.userId, now);
  const highFive = breakKey
    ? {
        busy,
        onSend: (userId: string, emoji: string) => void props.onHighFive(userId, emoji),
      }
    : undefined;
  const challenge = (
    <BreakChallengeCard room={room} me={me} now={now} busy={busy} onDone={props.onChallengeDone} />
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
      onKeepGoing={props.onKeepGoing}
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
      tables={room.tables}
      myTableId={me.tableId}
      busy={busy}
      onJoinTable={props.onJoinTable}
    />
  );

  if (compact) {
    const open = me.goals.filter((g) => !g.done).length;
    const done = me.goals.length - open;
    return (
      <div className="app">
        <Header {...props} />
        {room.boss.enabled && !room.boss.defeated && <MobileBoss boss={room.boss} />}
        {timer}
        {props.miniPlayer}
        {challenge}
        {props.podium}
        {board}
        <nav className="bottom-bar" aria-label="Session">
          <button type="button" className="btn btn-secondary" onClick={props.onOpenGoals}>
            Goals · {done} of {me.goals.length}
          </button>
          {me.keepGoingEndsAt > now ? (
            // You're released at the cycle's end anyway, so Keep going takes Leave's spot.
            <KeepGoing
              endsAt={me.keepGoingEndsAt}
              now={now}
              busy={busy}
              onKeepGoing={props.onKeepGoing}
            />
          ) : me.onRoomTimer ? (
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
          {props.miniPlayer}
          {challenge}
          {board}
        </main>
        <aside className="room-aside">
          {props.podium}
          {room.boss.enabled && !room.boss.defeated && <BossCard boss={room.boss} now={now} />}
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
