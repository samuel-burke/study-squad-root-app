import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HIGH_FIVE_EMOJI, tierFor, type BossDto } from "@studyroom/core";
import type { StudyRoomGateway } from "./api/gateway";
import { BadgeUnlocked } from "./components/BadgeUnlocked";
import { BossDefeated } from "./components/BossDefeated";
import { HighFiveFloats, myBreakKey, onBreak } from "./components/BreakFun";
import { MemberProfileSheet } from "./components/MemberProfileSheet";
import { Celebration } from "./components/Celebration";
import { FeedbackSheet } from "./components/FeedbackSheet";
import { SchedulePanel } from "./components/Schedule";
import type { GoalActions } from "./components/GoalList";
import { GoalsSheet } from "./components/GoalsSheet";
import { LeaderboardPodium } from "./components/LeaderboardPodium";
import { ProgressScreen } from "./components/ProgressScreen";
import { RoomScreen } from "./components/RoomScreen";
import { SettingsSheet } from "./components/SettingsSheet";
import { ShortcutsSheet } from "./components/ShortcutsSheet";
import { StartSessionSheet } from "./components/StartSessionSheet";
import { Toast } from "./components/Toast";
import { useMediaQuery } from "./state/useMediaQuery";
import { useNow } from "./state/useNow";
import { useSchedule } from "./state/useSchedule";
import { useShortcuts } from "./state/useShortcuts";
import { useProfiles } from "./state/useProfiles";
import { useCountdownChirps } from "./state/useCountdownChirps";
import { useEventSounds } from "./state/useEventSounds";
import { useMemberSounds } from "./state/useMemberSounds";
import { useSoundCues } from "./state/useSoundCues";
import { useSounds } from "./state/useSounds";
import { MiniPlayer, SoundsSheet } from "./components/SoundsSheet";
import { useStudyRoom } from "./state/useStudyRoom";
import { myTableView } from "./lib/view";

type Overlay =
  // `keys`: opened from the keyboard, so the sheet starts in its text box.
  | { kind: "start"; mode: "room" | "solo"; keys?: boolean }
  | { kind: "goals"; adding?: boolean }
  | { kind: "shortcuts" }
  | { kind: "settings" }
  | { kind: "sounds" }
  | { kind: "feedback" }
  | { kind: "member"; userId: string }
  | null;

export function App({ gateway }: { gateway: StudyRoomGateway }) {
  const { state, actions } = useStudyRoom(gateway);
  const compact = useMediaQuery("(max-width: 760px)");
  const [screen, setScreen] = useState<"room" | "progress">("room");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const schedule = useSchedule(gateway);
  // A badge the member asked to see unlock again, from the progress screen.
  const [replayBadge, setReplayBadge] = useState<string | null>(null);
  // Your own status isn't pushed when a room phase changes, but your card in
  // the room is, so the break chimes, music and colors follow that.
  const myCard = state.room?.members.find((m) => m.userId === state.me?.userId);
  const myStatus =
    state.me?.status === "idle" ? "idle" : (myCard?.status ?? state.me?.status ?? null);
  const sounds = useSoundCues(myStatus);
  const player = useSounds(myStatus);
  const serverNow = useCallback(() => gateway.now(), [gateway]);
  // Room timer members follow the room clock, which every phase change updates.
  const myEndsAt =
    !state.me || state.me.status === "idle"
      ? null
      : state.me.onRoomTimer && state.room
        ? myTableView(state.room, state.me).timer.phaseEndsAt
        : state.me.endsAt;
  // The clock flips on the same beat as the countdown ticks.
  const now = useNow(serverNow, myEndsAt);
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
  useMemberSounds(
    state.room?.members.map((m) => m.userId) ?? null,
    state.me?.userId ?? null,
    sounds.muted,
  );

  // The accent color follows the member's tier (styles.css).
  const tier = tierFor(state.me?.lifetimeFocusMinutes ?? 0).tier.id;
  useEffect(() => {
    document.documentElement.dataset.tier = tier;
  }, [tier]);
  // On your break the accent turns break teal (styles.css), so it's clear it's a break.
  const breakTime = myStatus === "roomBreak" || myStatus === "soloBreak";
  useEffect(() => {
    document.documentElement.toggleAttribute("data-break", breakTime);
  }, [breakTime]);

  // The boss going down gets its own full-screen moment, at the same time as
  // its music. Not for a boss that was already beaten when the app opened.
  const [bossDown, setBossDown] = useState<BossDto | null>(null);
  const closeBoss = useCallback(() => setBossDown(null), []);
  const bossSeen = useRef<{ key: string; defeated: boolean } | null>(null);
  useEffect(() => {
    if (!boss) return;
    const key = `${boss.name}:${boss.endsAt}`;
    const prev = bossSeen.current;
    bossSeen.current = { key, defeated: boss.defeated };
    if (prev && prev.key === key && !prev.defeated && boss.defeated && boss.enabled) {
      setBossDown(boss);
    }
  }, [boss]);

  const userIds = useMemo(
    () => [
      ...(state.room?.members.map((m) => m.userId) ?? []),
      ...schedule.sessions.map((s) => s.byUserId),
    ],
    [state.room, schedule.sessions],
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
  const modalOpen = overlay !== null;
  useEffect(() => {
    const node = background.current;
    if (!node) return;
    node.toggleAttribute("inert", modalOpen);
    if (modalOpen) node.setAttribute("aria-hidden", "true");
    else node.removeAttribute("aria-hidden");
  }, [modalOpen, state.status]);

  // E asks first ("Press E again…"); a second E within 2 s ends the session.
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(null), 2000);
    return () => clearTimeout(timer);
  }, [hint]);

  const keys: Record<string, () => void> = {};
  const you = state.me;
  const yourRoom = state.room && you ? myTableView(state.room, you) : null;
  if (you && yourRoom) {
    const idle = you.status === "idle";
    const start = (mode: "room" | "solo") => () => {
      if (idle) setOverlay({ kind: "start", mode, keys: true });
    };
    const mine = yourRoom.members.find((m) => m.userId === you.userId);
    const onMyBreak = myBreakKey(yourRoom, you.userId, now) !== null;
    Object.assign(keys, {
      f: start("room"),
      s: start("solo"),
      e: () => {
        if (idle) return;
        // The hint is up for 2 s, which is the window for the second E.
        if (hint) {
          setHint(null);
          void (you.onRoomTimer ? actions.leaveRoomTimer() : actions.endSolo());
          return;
        }
        const what = you.onRoomTimer
          ? "leave the room timer"
          : you.status === "soloBreak"
            ? "skip your solo break"
            : "end your solo timer";
        setHint(`Press E again to ${what}`);
      },
      enter: () => {
        if (you.keepGoingEndsAt > now) void actions.keepGoing();
      },
      g: () => setOverlay({ kind: "goals" }),
      n: () => setOverlay({ kind: "goals", adding: true }),
      m: () => setOverlay({ kind: "sounds" }),
      k: player.togglePlay,
      "[": () => player.skip(-1),
      "]": () => player.skip(1),
      q: () => sounds.setMuted(!sounds.muted),
      p: () => setScreen((s) => (s === "room" ? "progress" : "room")),
      escape: () => setScreen("room"),
      y: () => setOverlay({ kind: "member", userId: you.userId }),
      ",": () => setOverlay({ kind: "settings" }),
      // The voice button keeps its own confirm sheet.
      v: () => document.querySelector<HTMLElement>(".voice-btn")?.click(),
      d: () => {
        if (onMyBreak && mine?.challenge && !mine.challengeDone)
          void actions.completeBreakChallenge();
      },
      h: () => {
        if (!onMyBreak) return;
        for (const m of yourRoom.members)
          if (m.userId !== you.userId && onBreak(m.status))
            void actions.sendHighFive(m.userId, HIGH_FIVE_EMOJI[0]);
      },
      "?": () => setOverlay({ kind: "shortcuts" }),
    });
  }
  // Off while a sheet or a full-screen moment is up; those have their own keys.
  const momentUp = bossDown !== null || state.newBadges.length > 0 || replayBadge !== null;
  useShortcuts(keys, !modalOpen && !momentUp);

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
            ambientOn={player.musicOn || player.ambienceOn}
            miniPlayer={<MiniPlayer sounds={player} />}
            onOpenSounds={() => setOverlay({ kind: "sounds" })}
            onStart={(mode) => setOverlay({ kind: "start", mode })}
            onLeave={() => void actions.leaveRoomTimer()}
            onKeepGoing={() => void actions.keepGoing()}
            onEndSolo={() => void actions.endSolo()}
            goalActions={goalActions}
            onOpenGoals={() => setOverlay({ kind: "goals" })}
            onOpenProgress={() => setScreen("progress")}
            onOpenSettings={() => setOverlay({ kind: "settings" })}
            onOpenMember={(userId) => setOverlay({ kind: "member", userId })}
            onChallengeDone={() => void actions.completeBreakChallenge()}
            onHighFive={actions.sendHighFive}
            onJoinTable={(tableId) =>
              void actions.joinRoomTimer({ goals: [], goalsPrivate: me.goalsPrivate, tableId })
            }
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
          focusGoal={overlay.keys}
          onClose={() => setOverlay(null)}
          onStartRoom={actions.joinRoomTimer}
          onStartSolo={actions.startSolo}
          later={
            <SchedulePanel
              gateway={gateway}
              sessions={schedule.sessions}
              youId={me.userId}
              profiles={profiles}
              channelName={room.features.postChannelName}
              onChange={schedule.setSessions}
            />
          }
        />
      )}
      {overlay?.kind === "goals" && (
        <GoalsSheet
          me={me}
          xpEnabled={room.features.xpEnabled}
          busy={busy}
          actions={goalActions}
          adding={overlay.adding}
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
          onReplayBadge={setReplayBadge}
        />
      )}
      {overlay?.kind === "sounds" && (
        <SoundsSheet
          sounds={player}
          wide={!compact}
          effectsOn={!sounds.muted}
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
          onShowShortcuts={() => setOverlay({ kind: "shortcuts" })}
        />
      )}
      {overlay?.kind === "shortcuts" && <ShortcutsSheet onClose={() => setOverlay(null)} />}
      {overlay?.kind === "feedback" && (
        <FeedbackSheet gateway={gateway} onClose={() => setOverlay(null)} />
      )}

      {state.celebration && <Celebration celebration={state.celebration} />}
      {bossDown && <BossDefeated boss={bossDown} onDismiss={closeBoss} />}
      {/* The boss moment goes first; badges it earned unlock after it. */}
      {!bossDown && state.newBadges[0] && (
        <BadgeUnlocked
          key={state.newBadges[0]}
          badgeId={state.newBadges[0]}
          muted={sounds.muted}
          onDismiss={actions.dismissBadge}
        />
      )}
      {/* A freshly earned badge always goes first; a replay waits behind it. */}
      {!bossDown && !state.newBadges[0] && replayBadge && (
        <BadgeUnlocked
          key={`replay-${replayBadge}`}
          badgeId={replayBadge}
          muted={sounds.muted}
          onDismiss={() => setReplayBadge(null)}
        />
      )}
      <HighFiveFloats highFives={state.highFives} profiles={profiles} />
      {state.error && <Toast message={state.error} onDismiss={actions.dismissError} />}
      {hint && !state.error && <Toast message={hint} onDismiss={() => setHint(null)} />}
    </>
  );
}
