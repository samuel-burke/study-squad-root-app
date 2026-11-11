import {
  HIGH_FIVE_EMOJI,
  roomBreakKey,
  soloBreakKey,
  type MemberCardDto,
  type MyStatusDto,
  type RoomStateDto,
} from "@studyroom/core";
import type { Profile } from "../api/gateway";
import type { ReceivedHighFive } from "../state/roomState";

export function onBreak(status: MemberCardDto["status"]): boolean {
  return status === "roomBreak" || status === "soloBreak";
}

/**
 * The break you're on, named the same way the server names it. Null while
 * focusing or idle. It goes by your card on the board, which the server sends
 * every time the timer switches, and by the clock, so it never lingers into
 * study time while a push is on its way.
 */
export function myBreakKey(room: RoomStateDto, userId: string, now: number): string | null {
  const mine = room.members.find((m) => m.userId === userId);
  if (!mine) return null;
  if (mine.status === "roomBreak") {
    const { phase, phaseStartedAt, phaseEndsAt } = room.timer;
    if (phase !== "break" && phase !== "longBreak") return null;
    return now < phaseEndsAt ? roomBreakKey(mine.tableId, phaseStartedAt) : null;
  }
  if (mine.status === "soloBreak") {
    return now < mine.endsAt ? soloBreakKey(userId, mine.endsAt) : null;
  }
  return null;
}

/**
 * The break challenge: one small, screen-free thing to do, the same for
 * everyone on the break. Tapping Done puts a tick on your card. No XP.
 */
export function BreakChallengeCard({
  room,
  me,
  now,
  busy,
  onDone,
}: {
  room: RoomStateDto;
  me: MyStatusDto;
  now: number;
  busy: boolean;
  onDone(): void;
}) {
  const mine = room.members.find((m) => m.userId === me.userId);
  // The server picks each break's challenge, so it never repeats the last one.
  if (!myBreakKey(room, me.userId, now) || !mine?.challenge) return null;
  const done = mine?.challengeDone ?? false;
  // Everyone on your break: the whole room timer, or just you on a solo break.
  const together =
    mine?.status === "roomBreak"
      ? room.members.filter((m) => m.status === "roomBreak" && m.tableId === mine.tableId)
      : mine
        ? [mine]
        : [];
  const doneCount = together.filter((m) => m.challengeDone).length;
  const others = room.members.filter((m) => m.userId !== me.userId && onBreak(m.status));

  return (
    <section className="break-challenge" aria-label="Break challenge" data-done={done}>
      <div className="eyebrow break-challenge-eyebrow">Break challenge</div>
      <div className="break-challenge-body">
        <div className="break-challenge-text">{mine.challenge}</div>
        {done ? (
          <span className="break-challenge-done" role="status">
            ✓ Done
          </span>
        ) : (
          <button type="button" className="btn btn-teal" disabled={busy} onClick={onDone}>
            Done
          </button>
        )}
      </div>
      <div className="break-challenge-foot">
        {together.length > 1 && (
          <span>
            {doneCount} of {together.length} done
          </span>
        )}
        {others.length > 0 && <span>Tap 👋 on a teammate to high-five them</span>}
      </div>
    </section>
  );
}

/**
 * High-five buttons on a teammate's card. Shown only when you're both on a
 * break. Send as many as you like; the app's rate limit stops spam.
 */
export function HighFiveButtons({
  name,
  busy,
  onSend,
}: {
  name: string;
  busy: boolean;
  onSend(emoji: string): void;
}) {
  return (
    <span className="high-five-buttons">
      {HIGH_FIVE_EMOJI.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="high-five-btn"
          disabled={busy}
          aria-label={`Send ${name} ${emoji === "🔥" ? "a fire" : "a high-five"}`}
          onClick={() => onSend(emoji)}
        >
          {emoji}
        </button>
      ))}
    </span>
  );
}

/** Small marks on a card on a break: the challenge tick, and high-fives received. */
export function BreakMarks({ member }: { member: MemberCardDto }) {
  if (!onBreak(member.status)) return null;
  if (!member.challengeDone && member.highFives === 0) return null;
  return (
    <span className="break-marks">
      {member.challengeDone && (
        <span className="break-mark" role="img" aria-label="Did the break challenge">
          ✓
        </span>
      )}
      {member.highFives > 0 && (
        <span
          className="break-mark"
          role="img"
          aria-label={`${member.highFives} high-five${member.highFives === 1 ? "" : "s"}`}
        >
          👋 {member.highFives}
        </span>
      )}
    </span>
  );
}

/** High-fives you received, floating up from the bottom of the screen. */
export function HighFiveFloats({
  highFives,
  profiles,
}: {
  highFives: ReceivedHighFive[];
  profiles: Map<string, Profile>;
}) {
  if (highFives.length === 0) return null;
  return (
    <div className="high-five-floats" aria-live="polite">
      {highFives.map((h, i) => (
        <div key={h.id} className="high-five-float" style={{ left: `${30 + ((i * 17) % 40)}%` }}>
          <span className="high-five-float-emoji" aria-hidden="true">
            {h.emoji}
          </span>
          <span className="high-five-float-name">
            {profiles.get(h.fromUserId)?.name ?? "Someone"}
            <span className="visually-hidden">
              {" "}
              sent you {h.emoji === "🔥" ? "a fire" : "a high-five"}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
