import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createHarness } from "../../core/test/helpers";
import { Avatar } from "../src/components/Avatar";
import { strengthText } from "../src/components/BossCard";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
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
  it("lists goals, shows XP when enabled, and closes with Done", async () => {
    const { engine } = createHarness();
    const me = await engine.addGoal("ana", "Read ch. 4");
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onToggle = vi.fn();
    render(
      <GoalsSheet
        me={me}
        xpEnabled
        busy={false}
        onToggle={onToggle}
        onDelete={vi.fn()}
        onAdd={vi.fn(async () => true)}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Your goals" })).toHaveTextContent("Read ch. 4");
    await user.click(screen.getByRole("checkbox", { name: /Read ch. 4/ }));
    expect(onToggle).toHaveBeenCalledWith(me.goals[0]!.id, true);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
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
