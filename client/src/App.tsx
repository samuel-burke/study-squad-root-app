import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StudyRoomGateway } from "./api/gateway";
import { BadgeUnlocked } from "./components/BadgeUnlocked";
import { KeepGoing } from "./components/KeepGoing";
import { HighFiveFloats } from "./components/BreakFun";
import { MemberProfileSheet } from "./components/MemberProfileSheet";
import { BreakMoment } from "./components/BreakMoment";
import { Celebration } from "./components/Celebration";
import { FeedbackSheet } from "./components/FeedbackSheet";
import { ScheduleSheet, UpNext } from "./components/Schedule";
import type { GoalActions } from "./components/GoalList";
import { GoalsSheet } from "./components/GoalsSheet";
import { LeaderboardPodium } from "./components/LeaderboardPodium";
import { ProgressScreen } from "./components/ProgressScreen";
import { RoomScreen } from "./components/RoomScreen";
import { SettingsSheet } from "./components/SettingsSheet";
import { StartSessionSheet } from "./components/StartSessionSheet";
import { Toast } from "./components/Toast";
import { useMediaQuery } from "./state/useMediaQuery";
import { useNow } from "./state/useNow";
import { useSchedule } from "./state/useSchedule";
import { useProfiles } from "./state/useProfiles";
import { useCountdownChirps } from "./state/useCountdownChirps";
import { useEventSounds } from "./state/useEventSounds";
import { useSoundCues } from "./state/useSoundCues";
import { useAmbient } from "./state/useAmbient";
import { SoundsSheet } from "./components/SoundsSheet";
import { useStudyRoom } from "./state/useStudyRoom";
import { myTableView } from "./lib/view";

type Overlay =
  | { kind: "start"; mode: "room" | "solo" | "table" }
  | { kind: "goals" }
  | { kind: "settings" }
  | { kind: "sounds" }
  | { kind: "feedback" }
  | { kind: "schedule" }
  | { kind: "member"; userId: string }
  | null;

export function App({ gateway }: { gateway: StudyRoomGateway }) {
  const { state, actions } = useStudyRoom(gateway);
  const now = useNow(gateway.now.bind(gateway));
  const compact = useMediaQuery("(max-width: 760px)");
  const [screen, setScreen] = useState<"room" | "progress">("room");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const schedule = useSchedule(gateway);
  // A badge the member asked to see unlock again, from the progress screen.
  const [replayBadge, setReplayBadge] = useState<string | null>(null);
  const sounds = useSoundCues(state.me?.status ?? null);
  const ambient = useAmbient(state.me?.status ?? null);
  const serverNow = useCallback(() => gateway.now(), [gateway]);
  // Room timer members follow the room clock, which every phase change updates.
  const myEndsAt =
    !state.me || state.me.status === "idle"
      ? null
      : state.me.onRoomTimer && state.room
        ? myTableView(state.room, state.me).timer.phaseEndsAt
        : state.me.endsAt;
  useCountdownChirps(myEndsAt, serverNow, sounds.muted);
  const celebrationAt = state.celebration?.startedAt ?? null;
  const boss = state.room?.boss;
  const level = state.me?.level;
  const eventSoundState = useMemo(
    () =>
      boss && level !== undefined
        ? {
            celebrationAt,
            bossKey: `${boss.name}:${boss.endsAt}`,
            bossDefeated: boss.defeated,
            level,
          }
        : null,
    [celebrationAt, boss, level],
  );
  useEventSounds(eventSoundState, sounds.muted);

  const userIds = useMemo(
    () => [
      ...(state.room?.members.map((m) => m.userId) ?? []),
      ...(state.breakMoment?.finisherIds ?? []),
      ...schedule.sessions.map((s) => s.byUserId),
    ],
    [state.room, state.breakMoment, schedule.sessions],
  );
  const profiles = useProfiles(gateway, userIds);

  const goalActions = useMemo<GoalActions>(
    () => ({
      toggle: (id, done) => void actions.setGoalDone(id, done),
      remove: (id) => void actions.deleteGoal(id),
      add: actions.addGoal,
      edit: actions.editGoal,
      clearDone: () => void actions.clearDoneGoals(),
      reorder: (ids) => void actions.reorderGoals(ids),
    }),
    [actions],
  );

  // While a sheet is open, the page behind it can't be focused or clicked.
  const background = useRef<HTMLDivElement>(null);
  const modalOpen = overlay !== null || state.breakMoment !== null;
  useEffect(() => {
    const node = background.current;
    if (!node) return;
    node.toggleAttribute("inert", modalOpen);
    if (modalOpen) node.setAttribute("aria-hidden", "true");
    else node.removeAttribute("aria-hidden");
  }, [modalOpen, state.status]);

  if (state.status === "loading") {
    return (
      <div className="status-screen" role="status">
        Opening the room…
      </div>
    );
  }

  if (state.status === "error" || !state.room || !state.me) {
    return (
      <div className="status-screen" role="alert">
        <div>{state.error ?? "Couldn't open Study Squad."}</div>
        <button type="button" className="btn btn-primary" onClick={() => void actions.reload()}>
          Try again
        </button>
      </div>
    );
  }

  const { me } = state;
  // The timer you see is your own table's.
  const room = myTableView(state.room, me);
  const busy = state.pending > 0;

  return (
    <>
      <div ref={background}>
        {screen === "progress" ? (
          <ProgressScreen
            gateway={gateway}
            xpEnabled={room.features.xpEnabled}
            freezesEnabled={room.features.streakFreezesEnabled}
            onBack={() => setScreen("room")}
            onDeleteData={actions.deleteMyData}
            onOpenMember={(userId) => setOverlay({ kind: "member", userId })}
            onReplayBadge={setReplayBadge}
            // The room is pushed every focus minute, so stats stay live while this is open.
            refreshKey={room}
          />
        ) : (
          <RoomScreen
            room={room}
            me={me}
            profiles={profiles}
            now={now}
            busy={busy}
            compact={compact}
            soundsMuted={sounds.muted}
            ambientOn={ambient.sound !== "off"}
            onOpenSounds={() => setOverlay({ kind: "sounds" })}
            onStart={(mode) => setOverlay({ kind: "start", mode })}
            onLeave={() => void actions.leaveRoomTimer()}
            onEndSolo={() => void actions.endSolo()}
            goalActions={goalActions}
            onOpenGoals={() => setOverlay({ kind: "goals" })}
            onOpenProgress={() => setScreen("progress")}
            onOpenSettings={() => setOverlay({ kind: "settings" })}
            onOpenMember={(userId) => setOverlay({ kind: "member", userId })}
            onChallengeDone={() => void actions.completeBreakChallenge()}
            onHighFive={actions.sendHighFive}
            upNext={
              <UpNext
                sessions={schedule.sessions}
                youId={me.userId}
                profiles={profiles}
                compact={compact}
                busy={busy}
                onOpen={() => setOverlay({ kind: "schedule" })}
                onRsvp={(id, going) =>
                  void gateway.rsvpSession(id, going).then(schedule.setSessions, () => {})
                }
              />
            }
            onJoinTable={(tableId) =>
              void actions.joinRoomTimer({ goals: [], goalsPrivate: me.goalsPrivate, tableId })
            }
            onNewTable={() => setOverlay({ kind: "start", mode: "table" })}
            podium={
              <LeaderboardPodium
                gateway={gateway}
                compact={compact}
                onOpenLeaderboard={() => setScreen("progress")}
                onOpenMember={(userId) => setOverlay({ kind: "member", userId })}
                refreshKey={room}
              />
            }
          />
        )}
      </div>

      {overlay?.kind === "start" && (
        <StartSessionSheet
          room={room}
          me={me}
          now={now}
          busy={busy}
          initialMode={overlay.mode}
          onClose={() => setOverlay(null)}
          onStartRoom={actions.joinRoomTimer}
          onStartSolo={actions.startSolo}
        />
      )}
      {overlay?.kind === "goals" && (
        <GoalsSheet
          me={me}
          xpEnabled={room.features.xpEnabled}
          busy={busy}
          actions={goalActions}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === "member" && (
        <MemberProfileSheet
          key={overlay.userId}
          gateway={gateway}
          userId={overlay.userId}
          you={overlay.userId === me.userId}
          xpEnabled={room.features.xpEnabled}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === "sounds" && (
        <SoundsSheet
          sound={ambient.sound}
          volume={ambient.volume}
          effectsOn={!sounds.muted}
          onSound={ambient.setSound}
          onVolume={ambient.setVolume}
          onEffects={(on) => sounds.setMuted(!on)}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === "settings" && (
        <SettingsSheet
          room={state.room}
          gateway={gateway}
          onClose={() => setOverlay(null)}
          onSendFeedback={() => setOverlay({ kind: "feedback" })}
        />
      )}
      {overlay?.kind === "schedule" && (
        <ScheduleSheet
          gateway={gateway}
          sessions={schedule.sessions}
          youId={me.userId}
          profiles={profiles}
          channelName={room.features.postChannelName}
          onChange={schedule.setSessions}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === "feedback" && (
        <FeedbackSheet gateway={gateway} onClose={() => setOverlay(null)} />
      )}

      {state.celebration && (
        <Celebration celebration={state.celebration} quiet={state.breakMoment !== null} />
      )}
      {state.breakMoment && (
        <BreakMoment
          result={state.breakMoment}
          boss={room.boss}
          profiles={profiles}
          youId={me.userId}
          xpEnabled={room.features.xpEnabled}
          chatChannel={room.features.postChannelName}
          now={now}
          busy={busy}
          onGoalDone={(id) => {
            void actions.setGoalDone(id, true).then((ok) => ok && actions.dismissBreak());
          }}
          onClose={actions.dismissBreak}
        />
      )}
      {state.newBadges[0] && (
        <BadgeUnlocked
          key={state.newBadges[0]}
          badgeId={state.newBadges[0]}
          muted={sounds.muted}
          onDismiss={actions.dismissBadge}
        />
      )}
      {/* A freshly earned badge always goes first; a replay waits behind it. */}
      {!state.newBadges[0] && replayBadge && (
        <BadgeUnlocked
          key={`replay-${replayBadge}`}
          badgeId={replayBadge}
          muted={sounds.muted}
          onDismiss={() => setReplayBadge(null)}
        />
      )}
      {me.keepGoingEndsAt > now && (
        <KeepGoing
          endsAt={me.keepGoingEndsAt}
          now={now}
          busy={busy}
          onKeepGoing={() => void actions.keepGoing()}
        />
      )}
      <HighFiveFloats highFives={state.highFives} profiles={profiles} />
      {state.error && <Toast message={state.error} onDismiss={actions.dismissError} />}
    </>
  );
}
