import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHarness, MINUTE } from "../../core/test/helpers";
import { DemoGateway } from "../src/api/demoGateway";
import { App } from "../src/App";
import { SHORTCUT_GROUPS } from "../src/lib/shortcuts";
import { useArrowKeys } from "../src/state/useArrowKeys";

async function renderApp(options: Partial<Parameters<typeof DemoGateway.create>[0]> = {}) {
  const gateway = await DemoGateway.create({ bots: false, elapsedMinutes: 0, ...options });
  const user = userEvent.setup();
  render(<App gateway={gateway} />);
  await screen.findByRole("timer");
  return { gateway, user };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("keyboard shortcuts", () => {
  it("lists every shortcut on ? and closes with Escape", async () => {
    const { user } = await renderApp();
    await user.keyboard("?");
    const sheet = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    for (const group of SHORTCUT_GROUPS) {
      const section = within(sheet).getByRole("region", { name: group.title });
      for (const [label] of group.rows) expect(section).toHaveTextContent(label);
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the list from room settings too", async () => {
    const { user } = await renderApp();
    await user.keyboard(",");
    const settings = screen.getByRole("dialog", { name: "Room settings" });
    await user.click(within(settings).getByRole("button", { name: /Keyboard shortcuts/ }));
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });

  it("starts focusing at the main table with F, a goal and Enter", async () => {
    const { user } = await renderApp();
    await user.keyboard("f");
    const dialog = screen.getByRole("dialog", { name: "What are you working on?" });
    // Opened from the keyboard, the goal box is ready to type in.
    expect(within(dialog).getByLabelText("Goals for this session")).toHaveFocus();
    expect(within(dialog).getByRole("radio", { name: /Join the room timer/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.keyboard("Make 20 flashcards{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("listitem", { name: /You, Room timer/ })).toHaveTextContent(
      "Make 20 flashcards",
    );
  });

  it("does the same with only Tab and Enter, no shortcut", async () => {
    const { user } = await renderApp();
    const join = screen.getByRole("button", { name: "Join room timer" });
    join.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "What are you working on?" });
    // A click or tap leaves the goal box alone, so the phone keyboard stays down.
    expect(within(dialog).getByLabelText("Goals for this session")).not.toHaveFocus();
    // Now and Later are one Tab stop, so one Tab reaches the goal box.
    await user.tab();
    expect(within(dialog).getByLabelText("Goals for this session")).toHaveFocus();
    await user.keyboard("Read ch. 4{Enter}");
    expect(await screen.findByRole("listitem", { name: /You, Room timer/ })).toHaveTextContent(
      "Read ch. 4",
    );
  });

  it("starts a solo timer with S, then ends it only on a second E", async () => {
    const { gateway, user } = await renderApp();
    const endSolo = vi.spyOn(gateway, "endSolo");
    await user.keyboard("s");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: /Solo timer/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.keyboard("e");
    expect(screen.getByRole("alert")).toHaveTextContent("Press E again to end your solo timer");
    expect(endSolo).not.toHaveBeenCalled();
    await user.keyboard("e");
    expect(endSolo).toHaveBeenCalledOnce();
    expect(await screen.findByRole("button", { name: "Start a solo timer" })).toBeInTheDocument();
  });

  it("forgets the first E after 2 seconds", async () => {
    const { gateway, user } = await renderApp();
    const leave = vi.spyOn(gateway, "leaveRoomTimer");
    await user.keyboard("f{Enter}");
    await screen.findByRole("button", { name: "Leave room timer" });
    await user.keyboard("e");
    expect(screen.getByRole("alert")).toHaveTextContent("Press E again to leave the room timer");
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument(), {
      timeout: 3_000,
    });
    await user.keyboard("e");
    expect(leave).not.toHaveBeenCalled();
  });

  it("opens goals with G, and a new goal box with N", async () => {
    const { user } = await renderApp();
    await user.keyboard("g");
    expect(screen.getByRole("dialog", { name: "Your goals" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.keyboard("n");
    const sheet = screen.getByRole("dialog", { name: "Your goals" });
    expect(within(sheet).getByLabelText("New goal")).toHaveFocus();
    await user.keyboard("Flashcards{Enter}");
    expect(await within(sheet).findByText("Flashcards")).toBeInTheDocument();
  });

  it("goes to progress with P and back with P or Escape", async () => {
    const { user } = await renderApp();
    await user.keyboard("p");
    expect(await screen.findByRole("button", { name: "Back to the room" })).toBeInTheDocument();
    await user.keyboard("p");
    expect(await screen.findByRole("timer")).toBeInTheDocument();
    await user.keyboard("p");
    await screen.findByRole("button", { name: "Back to the room" });
    await user.keyboard("{Escape}");
    expect(await screen.findByRole("timer")).toBeInTheDocument();
  });

  it("opens sounds with M, your profile with Y and settings with a comma", async () => {
    const { user } = await renderApp();
    await user.keyboard("m");
    expect(screen.getByRole("dialog", { name: "Sounds" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.keyboard("y");
    expect(await screen.findByRole("dialog")).toHaveTextContent(/./);
    await user.keyboard("{Escape}");
    await user.keyboard(",");
    expect(screen.getByRole("dialog", { name: "Room settings" })).toBeInTheDocument();
  });

  it("turns sound effects off and on with Q", async () => {
    const { user } = await renderApp();
    const sounds = screen.getByRole("button", { name: "Sounds" });
    const before = sounds.getAttribute("title");
    await user.keyboard("q");
    expect(sounds.getAttribute("title")).not.toBe(before);
    await user.keyboard("q");
    expect(sounds.getAttribute("title")).toBe(before);
  });

  it("ignores keys while typing, with Ctrl, Cmd or Alt, and with Shift", async () => {
    const { user } = await renderApp();
    const session = screen.getByRole("region", { name: "Your session" });
    await user.click(within(session).getByRole("button", { name: "Add a goal" }));
    await user.keyboard("gfp?");
    expect(within(session).getByLabelText("New goal")).toHaveValue("gfp?");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    within(session).getByLabelText("New goal").blur();
    await user.keyboard("{Control>}g{/Control}{Meta>}m{/Meta}{Alt>}p{/Alt}{Shift>}F{/Shift}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  it("leaves the keys alone while a sheet is open", async () => {
    const { user } = await renderApp();
    await user.keyboard("m");
    await user.keyboard("g");
    expect(screen.getByRole("dialog", { name: "Sounds" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Your goals" })).not.toBeInTheDocument();
  });

  it("presses Keep going with Enter in the long break", async () => {
    const gateway = await DemoGateway.create({ bots: false, elapsedMinutes: 0 });
    const snapshot = await gateway.getSnapshot();
    vi.spyOn(gateway, "getSnapshot").mockResolvedValueOnce({
      ...snapshot,
      me: { ...snapshot.me, keepGoingEndsAt: gateway.now() + 10 * MINUTE },
    });
    const keepGoing = vi
      .spyOn(gateway, "keepGoing")
      .mockResolvedValueOnce({ ...snapshot.me, keepGoingEndsAt: 0 });
    const user = userEvent.setup();
    render(<App gateway={gateway} />);
    await screen.findByRole("button", { name: /^Keep going/ });
    await user.keyboard("{Enter}");
    expect(keepGoing).toHaveBeenCalledOnce();
  });

  it("does the break challenge with D and high-fives everyone on a break with H", async () => {
    const { engine, advance } = createHarness();
    await engine.joinRoomTimer("me");
    await engine.joinRoomTimer("kai");
    await engine.joinRoomTimer("ana");
    await advance(26 * MINUTE);
    const snapshot = await engine.getSnapshot("me");
    const gateway = await DemoGateway.create({ bots: false, elapsedMinutes: 0 });
    vi.spyOn(gateway, "getSnapshot").mockResolvedValue(snapshot);
    vi.spyOn(gateway, "now").mockReturnValue(snapshot.room.serverNow);
    const done = vi.spyOn(gateway, "completeBreakChallenge").mockResolvedValue(snapshot);
    const highFive = vi.spyOn(gateway, "sendHighFive").mockResolvedValue(snapshot);
    const user = userEvent.setup();
    render(<App gateway={gateway} />);
    await screen.findByRole("region", { name: "Break challenge" });

    await user.keyboard("h");
    expect(highFive.mock.calls.map(([id]) => id).sort()).toEqual(["ana", "kai"]);
    expect(highFive.mock.calls.every(([, emoji]) => emoji === "👋")).toBe(true);
    await user.keyboard("d");
    expect(done).toHaveBeenCalledOnce();
  });
});

describe("arrow keys", () => {
  it("moves through the timer choices and picks as it goes, as one Tab stop", async () => {
    const { user } = await renderApp();
    await user.keyboard("f");
    const dialog = screen.getByRole("dialog");
    const room = within(dialog).getByRole("radio", { name: /Join the room timer/ });
    const solo = within(dialog).getByRole("radio", { name: /Solo timer/ });
    const table = within(dialog).getByRole("radio", { name: /Start a new table/ });
    expect([room, solo, table].map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    room.focus();
    await user.keyboard("{ArrowDown}");
    expect(solo).toHaveFocus();
    expect(solo).toHaveAttribute("aria-checked", "true");
    // The solo lengths are their own group, not part of this one.
    await user.keyboard("{ArrowDown}");
    expect(table).toHaveFocus();
    expect(table).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{ArrowDown}");
    expect(room).toHaveFocus();
    await user.keyboard("{End}");
    expect(table).toHaveFocus();
    expect([room, solo, table].map((r) => r.tabIndex)).toEqual([-1, -1, 0]);
  });

  it("picks a solo length with the arrow keys", async () => {
    const { user } = await renderApp();
    await user.keyboard("s");
    const lengths = within(screen.getByRole("dialog")).getByRole("radiogroup", {
      name: "Solo timer length",
    });
    within(lengths).getByRole("radio", { name: "25 min" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(within(lengths).getByRole("radio", { name: "45 min" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.keyboard("{Home}");
    expect(within(lengths).getByRole("radio", { name: "15 min" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("switches between Now and Later with the arrow keys", async () => {
    const { user } = await renderApp();
    await user.keyboard("f");
    const dialog = screen.getByRole("dialog");
    within(dialog).getByRole("button", { name: "Now" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(within(dialog).getByRole("button", { name: "Later" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("picks ambience with the arrow keys and moves through tracks without playing them", async () => {
    const { user } = await renderApp();
    await user.keyboard("m");
    const dialog = screen.getByRole("dialog", { name: "Sounds" });
    within(dialog).getByRole("button", { name: "Off" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(within(dialog).getByRole("button", { name: "Rain" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const tracks = within(within(dialog).getByRole("list", { name: "Tracks" })).getAllByRole(
      "button",
    );
    expect(tracks.filter((t) => t.tabIndex === 0)).toHaveLength(1);
    tracks[0]!.focus();
    await user.keyboard("{ArrowDown}");
    expect(tracks[1]).toHaveFocus();
    expect(tracks[1]).not.toHaveAttribute("aria-current");
  });

  it("walks the streak heatmap by day", async () => {
    const { user } = await renderApp();
    await user.keyboard("p");
    const heatmap = await screen.findByRole("list", { name: "Focus time, last 5 weeks" });
    const days = within(heatmap)
      .getAllByRole("listitem")
      .filter((d) => d.hasAttribute("aria-label"));
    expect(days.filter((d) => d.tabIndex === 0)).toHaveLength(1);
    days[0]!.focus();
    await user.keyboard("{ArrowRight}");
    expect(days[1]).toHaveFocus();
  });

  it("moves between people on the board, and Enter opens the profile", async () => {
    const { user } = await renderApp({ bots: true, elapsedMinutes: 5 });
    const board = screen.getByRole("region", { name: "Who is in the room" });
    const people = within(board).getAllByRole("button", { name: /^View / });
    expect(people.length).toBeGreaterThan(2);
    expect(people.filter((p) => p.tabIndex === 0)).toHaveLength(1);
    people[0]!.focus();
    await user.keyboard("{ArrowRight}");
    expect(people[1]).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

/** The hook on its own: a grid wraps into rows, and ↑ ↓ go by row. */
function Grid({ tops }: { tops: number[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useArrowKeys(ref);
  return (
    <div ref={ref}>
      {tops.map((top, i) => (
        <button
          key={i}
          type="button"
          ref={(el) => {
            if (el)
              el.getBoundingClientRect = () =>
                ({ top, left: (i % 3) * 100, width: 90, height: 40 }) as DOMRect;
          }}
        >
          {`Item ${i}`}
        </button>
      ))}
    </div>
  );
}

describe("useArrowKeys", () => {
  it("goes to the same column in the next row, and stays put at the edge", async () => {
    const user = userEvent.setup();
    render(<Grid tops={[0, 0, 0, 50, 50, 50, 100]} />);
    const item = (i: number) => screen.getByRole("button", { name: `Item ${i}` });
    item(1).focus();
    await user.keyboard("{ArrowDown}");
    expect(item(4)).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    // The last row has only the first column; the nearest is it.
    expect(item(6)).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(item(6)).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(item(0)).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(item(6)).toHaveFocus();
  });

  it("ignores arrows with a modifier, which belong to Root", async () => {
    const user = userEvent.setup();
    render(<Grid tops={[0, 0, 0]} />);
    screen.getByRole("button", { name: "Item 0" }).focus();
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(screen.getByRole("button", { name: "Item 0" })).toHaveFocus();
  });
});
