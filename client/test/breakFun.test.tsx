import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { breakChallengeFor, roomBreakKey, type MemberCardDto } from "@studyroom/core";
import { createHarness, MINUTE } from "../../core/test/helpers";
import { BreakChallengeCard, HighFiveFloats } from "../src/components/BreakFun";
import { MemberBoard } from "../src/components/MemberBoard";
import { initialRoomViewState, roomReducer } from "../src/state/roomState";

const card = (userId: string, overrides: Partial<MemberCardDto> = {}): MemberCardDto => ({
  userId,
  status: "roomBreak",
  endsAt: 60_000,
  goalText: "",
  goalPrivate: false,
  level: 3,
  streak: 2,
  badges: [],
  cardStyle: "classic",
  weeklyRank: 0,
  challengeDone: false,
  highFives: 0,
  ...overrides,
});

const profiles = new Map([
  ["me", { userId: "me", name: "Sam" }],
  ["kai", { userId: "kai", name: "Kai" }],
]);

/** A real room on its first break, with Sam (me) and Kai. */
async function roomOnBreak() {
  const { engine, advance } = createHarness();
  await engine.joinRoomTimer("me");
  await engine.joinRoomTimer("kai");
  await advance(26 * MINUTE);
  return engine;
}

describe("BreakChallengeCard", () => {
  it("shows the break's challenge, the room's count and a Done button", async () => {
    const engine = await roomOnBreak();
    await engine.completeBreakChallenge("kai");
    const { room, me } = await engine.getSnapshot("me");
    const onDone = vi.fn();
    render(<BreakChallengeCard room={room} me={me} busy={false} onDone={onDone} />);
    const challenge = breakChallengeFor(roomBreakKey(room.timer.phaseStartedAt));
    expect(screen.getByText(challenge.text)).toBeInTheDocument();
    expect(screen.getByText("1 of 2 done")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("shows a tick once you're done, and nothing while focusing", async () => {
    const engine = await roomOnBreak();
    const { room, me } = await engine.completeBreakChallenge("me");
    const { rerender } = render(
      <BreakChallengeCard room={room} me={me} busy={false} onDone={vi.fn()} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("✓ Done");
    rerender(
      <BreakChallengeCard
        room={room}
        me={{ ...me, status: "roomFocus" }}
        busy={false}
        onDone={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Break challenge")).not.toBeInTheDocument();
  });
});

describe("high-fives on the board", () => {
  it.each([false, true])("sends from a teammate's card (compact: %s)", async (compact) => {
    const onSend = vi.fn();
    const onOpen = vi.fn();
    render(
      <MemberBoard
        members={[card("me"), card("kai", { highFives: 2, challengeDone: true })]}
        profiles={profiles}
        youId="me"
        now={0}
        compact={compact}
        onOpenMember={onOpen}
        highFive={{ sent: new Set(), busy: false, onSend }}
      />,
    );
    // Only on Kai's card, never your own.
    expect(screen.getAllByRole("button", { name: /high-five/ })).toHaveLength(1);
    expect(screen.getByRole("img", { name: "2 high-fives" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Did the break challenge" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send Kai a fire" }));
    expect(onSend).toHaveBeenCalledWith("kai", "🔥");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("hides the buttons for someone focusing or already high-fived", () => {
    const { rerender } = render(
      <MemberBoard
        members={[card("me"), card("kai", { status: "soloFocus" })]}
        profiles={profiles}
        youId="me"
        now={0}
        highFive={{ sent: new Set(), busy: false, onSend: vi.fn() }}
      />,
    );
    expect(screen.queryByRole("button", { name: /high-five/ })).not.toBeInTheDocument();
    rerender(
      <MemberBoard
        members={[card("me"), card("kai")]}
        profiles={profiles}
        youId="me"
        now={0}
        highFive={{ sent: new Set(["kai"]), busy: false, onSend: vi.fn() }}
      />,
    );
    expect(screen.queryByRole("button", { name: /high-five/ })).not.toBeInTheDocument();
    expect(screen.getByText("High-fived")).toBeInTheDocument();
  });
});

describe("received high-fives", () => {
  it("float up with the sender's name and fade out of state", () => {
    let state = roomReducer(initialRoomViewState, {
      type: "highFive",
      event: { fromUserId: "kai", emoji: "👋" },
      id: 1,
    });
    render(<HighFiveFloats highFives={state.highFives} profiles={profiles} />);
    expect(screen.getByText("Kai")).toBeInTheDocument();
    act(() => {
      state = roomReducer(state, { type: "highFiveFaded", id: 1 });
    });
    expect(state.highFives).toEqual([]);
  });

  it("keeps only a few on screen at once", () => {
    let state = initialRoomViewState;
    for (let id = 1; id <= 10; id++) {
      state = roomReducer(state, {
        type: "highFive",
        event: { fromUserId: "kai", emoji: "👋" },
        id,
      });
    }
    expect(state.highFives.map((h) => h.id)).toEqual([7, 8, 9, 10]);
  });
});
