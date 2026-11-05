import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createHarness } from "../../core/test/helpers";
import { Avatar } from "../src/components/Avatar";
import { strengthText } from "../src/components/BossCard";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import type { GoalActions } from "../src/components/GoalList";
import { GoalsSheet } from "../src/components/GoalsSheet";
import { MemberBoard } from "../src/components/MemberBoard";
import { Sheet } from "../src/components/Sheet";

describe("Sheet", () => {
  function renderSheet(onClose = vi.fn()) {
    render(
      <Sheet labelledBy="t" onClose={onClose}>
        <h1 id="t">Title</h1>
        <button type="button">First</button>
        <button type="button">Last</button>
      </Sheet>,
    );
    return onClose;
  }

  it("keeps Tab focus inside the dialog in both directions", async () => {
    const user = userEvent.setup();
    renderSheet();
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
  });

  it("closes on a backdrop click but not a click inside", async () => {
    const user = userEvent.setup();
    const onClose = renderSheet();
    await user.click(screen.getByRole("button", { name: "First" }));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Tab when nothing inside can take focus", async () => {
    const user = userEvent.setup();
    render(
      <Sheet labelledBy="t" onClose={vi.fn()}>
        <h1 id="t">Empty</h1>
      </Sheet>,
    );
    await user.tab();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("GoalsSheet", () => {
  const goalActions = (): GoalActions => ({
    toggle: vi.fn(),
    remove: vi.fn(),
    add: vi.fn(async () => true),
    edit: vi.fn(async () => true),
    clearDone: vi.fn(),
    reorder: vi.fn(),
  });

  it("lists goals, shows XP when enabled, and closes with Done", async () => {
    const { engine } = createHarness();
    const me = await engine.addGoal("ana", "Read ch. 4");
    const user = userEvent.setup();
    const onClose = vi.fn();
    const actions = goalActions();
    render(<GoalsSheet me={me} xpEnabled busy={false} actions={actions} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Your goals" })).toHaveTextContent("Read ch. 4");
    expect(screen.queryByRole("button", { name: /Clear completed/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Read ch. 4/ }));
    expect(actions.toggle).toHaveBeenCalledWith(me.goals[0]!.id, true);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("folds finished goals away with how long they took, and clears them in one go", async () => {
    const { engine, advance } = createHarness();
    await engine.addGoal("ana", "Read ch. 4");
    let me = await engine.addGoal("ana", "Flashcards");
    await advance(95 * 60_000);
    me = await engine.setGoalDone("ana", me.goals[0]!.id, true);
    const user = userEvent.setup();
    const actions = goalActions();
    render(
      <GoalsSheet me={me} xpEnabled={false} busy={false} actions={actions} onClose={vi.fn()} />,
    );
    const texts = (name: string) =>
      within(screen.getByRole("list", { name }))
        .getAllByRole("listitem")
        .map((li) => li.textContent);
    expect(texts("Open goals")).toEqual(["Flashcards"]);
    expect(screen.queryByRole("list", { name: "Finished goals" })).not.toBeInTheDocument();
    const fold = screen.getByRole("button", { name: "Finished (1)" });
    expect(fold).toHaveAttribute("aria-expanded", "false");
    await user.click(fold);
    expect(texts("Finished goals")).toEqual(["Read ch. 4Took 1h 35m"]);
    await user.click(screen.getByRole("button", { name: "Clear completed" }));
    expect(actions.clearDone).toHaveBeenCalled();
  });

  it("reorders goals with the arrow keys on the handle and marks the one on the card", async () => {
    const { engine } = createHarness();
    await engine.joinRoomTimer("ana", { goals: ["A", "B", "C"] });
    const me = (await engine.getSnapshot("ana")).me;
    const [a, b, c] = me.goals.map((g) => g.id);
    const user = userEvent.setup();
    const actions = goalActions();
    const sheet = (busy: boolean) => (
      <GoalsSheet me={me} xpEnabled={false} busy={busy} actions={actions} onClose={vi.fn()} />
    );
    const { rerender } = render(sheet(false));
    const items = within(screen.getByRole("list", { name: "Open goals" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("On your card");
    expect(items[1]).not.toHaveTextContent("On your card");
    screen.getByRole("button", { name: /Reorder goal: A/ }).focus();
    await user.keyboard("{ArrowDown}");
    expect(actions.reorder).toHaveBeenCalledWith([b, a, c]);
    // Shown in the new order while the request is out.
    rerender(sheet(true));
    expect(
      within(screen.getByRole("list", { name: "Open goals" }))
        .getAllByRole("checkbox")
        .map((box) => box.getAttribute("aria-label")),
    ).toEqual(["B", "A", "C"]);
    expect(screen.getByText("A moved to 2 of 3.")).toBeInTheDocument();
  });

  it("drags a goal by its handle to a new place", async () => {
    const { engine } = createHarness();
    await engine.joinRoomTimer("ana", { goals: ["A", "B", "C"] });
    const me = (await engine.getSnapshot("ana")).me;
    const [a, b, c] = me.goals.map((g) => g.id);
    const actions = goalActions();
    render(
      <GoalsSheet me={me} xpEnabled={false} busy={false} actions={actions} onClose={vi.fn()} />,
    );
    // jsdom has no layout, so give each row a 40px slot.
    const rows = within(screen.getByRole("list", { name: "Open goals" })).getAllByRole("listitem");
    rows.forEach((row, i) => {
      const top = i * 40;
      row.getBoundingClientRect = () =>
        ({ top, bottom: top + 40, height: 40, left: 0, right: 300, width: 300 }) as DOMRect;
      Object.defineProperty(row, "offsetHeight", { value: 40 });
    });
    const handle = screen.getByRole("button", { name: /Reorder goal: A/ });
    handle.setPointerCapture = vi.fn();
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: 20 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 105 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 105 });
    expect(actions.reorder).toHaveBeenCalledWith([b, c, a]);
  });

  it("edits a goal in place", async () => {
    const { engine } = createHarness();
    const me = await engine.addGoal("ana", "Read ch. 4");
    const user = userEvent.setup();
    const actions = goalActions();
    render(
      <GoalsSheet me={me} xpEnabled={false} busy={false} actions={actions} onClose={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Edit goal: Read ch. 4" }));
    const input = screen.getByRole("textbox", { name: "Edit goal" });
    await user.clear(input);
    await user.type(input, "Read ch. 5{Enter}");
    expect(actions.edit).toHaveBeenCalledWith(me.goals[0]!.id, "Read ch. 5");
    expect(screen.queryByRole("textbox", { name: "Edit goal" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit goal: Read ch. 4" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Edit goal" })).not.toBeInTheDocument();
    expect(actions.edit).toHaveBeenCalledTimes(1);
  });
});

describe("ErrorBoundary", () => {
  it("replaces a crashed tree with a retry that remounts it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // React reports the caught error to window too; keep jsdom from printing it.
    const quiet = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener("error", quiet);
    let crash = true;
    function Fragile() {
      if (crash) throw new Error("render bug");
      return <p>Room is back</p>;
    }
    render(
      <ErrorBoundary>
        <Fragile />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    crash = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Room is back")).toBeInTheDocument();
    window.removeEventListener("error", quiet);
  });
});

describe("strengthText", () => {
  it("shows a second decimal only when the strength needs one", () => {
    const text = (strength: number) =>
      strengthText({ strength } as Parameters<typeof strengthText>[0]);
    expect(text(1)).toBe("Strength 1.0×");
    expect(text(1.5)).toBe("Strength 1.5×");
    expect(text(1.25)).toBe("Strength 1.25×");
  });
});

describe("Avatar", () => {
  it("shows your own profile picture when you have one", () => {
    const { container } = render(
      <Avatar
        userId="me"
        you
        profile={{ userId: "me", name: "Sam", avatarUrl: "https://cdn.test/me.png" }}
      />,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn.test/me.png");
    expect(container).not.toHaveTextContent("YOU");
  });

  it("falls back to YOU without a picture", () => {
    const { container } = render(
      <Avatar userId="me" you profile={{ userId: "me", name: "Sam" }} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("YOU");
  });
});

describe("MemberBoard", () => {
  const me = {
    userId: "me",
    status: "roomFocus" as const,
    endsAt: 60_000,
    goalText: "",
    goalPrivate: false,
    level: 3,
    streak: 2,
    badges: [],
    cardStyle: "default",
    weeklyRank: 0,
  };

  it.each([false, true])("shows your Root name instead of You (compact: %s)", (compact) => {
    render(
      <MemberBoard
        members={[me]}
        profiles={new Map([["me", { userId: "me", name: "Sam" }]])}
        youId="me"
        now={0}
        compact={compact}
        onOpenMember={vi.fn()}
      />,
    );
    expect(screen.getByRole("listitem", { name: /^Sam, Room timer/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View your profile" })).toBeInTheDocument();
  });

  it("says You until your profile loads", () => {
    render(<MemberBoard members={[me]} profiles={new Map()} youId="me" now={0} />);
    expect(screen.getByRole("listitem", { name: /^You, Room timer/ })).toBeInTheDocument();
  });
});
