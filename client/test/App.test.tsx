import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoGateway } from "../src/api/demoGateway";
import { App } from "../src/App";

async function renderApp(options: Partial<Parameters<typeof DemoGateway.create>[0]> = {}) {
  const gateway = await DemoGateway.create({ bots: false, elapsedMinutes: 0, ...options });
  const user = userEvent.setup();
  render(<App gateway={gateway} />);
  await screen.findByRole("timer");
  return { gateway, user };
}

function mockViewport(compact: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: compact && query.includes("max-width"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Study Squad app", () => {
  it("opens on an idle room with an empty board", async () => {
    await renderApp();
    expect(screen.getByRole("timer")).toHaveTextContent("25:00");
    expect(screen.getByText("Room timer is free")).toBeInTheDocument();
    expect(screen.getByText(/The room is quiet/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Focusing now · 0" })).toBeInTheDocument();
  });

  it("joins the room timer with a goal and shows your card on the board", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Join room timer" }));
    const dialog = screen.getByRole("dialog", { name: "What are you working on?" });
    expect(within(dialog).getByRole("radio", { name: /Join the room timer/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.type(within(dialog).getByLabelText("Goals for this session"), "Make 20 flashcards");
    await user.click(within(dialog).getByRole("button", { name: "Start focusing" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const board = screen.getByRole("region", { name: "Who is in the room" });
    const card = within(board).getByRole("listitem", { name: /You, Room timer/ });
    expect(card).toHaveTextContent("Make 20 flashcards");
    expect(screen.getByText("Focus · round 1 of 4")).toBeInTheDocument();
    // Like the mockup, the dot for the round in progress is filled.
    const dots = document.querySelectorAll(".round-dot");
    expect([...dots].map((d) => d.getAttribute("data-done"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
    expect(screen.getByRole("button", { name: "Leave room timer" })).toBeInTheDocument();
  });

  it("shows only 'Focusing' to the room when goals are private", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Join room timer" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Goals for this session"), "Secret thesis plan");
    await user.click(within(dialog).getByRole("switch", { name: "Keep my goals private" }));
    await user.click(within(dialog).getByRole("button", { name: "Start focusing" }));

    const card = await screen.findByRole("listitem", { name: /You, Room timer/ });
    expect(card).toHaveTextContent("Focusing");
    expect(card).not.toHaveTextContent("Secret thesis plan");
    // You still see your own goal in your private list.
    expect(
      within(screen.getByRole("region", { name: "Your session" })).getByText("Secret thesis plan"),
    ).toBeInTheDocument();
  });

  it("starts a solo timer with a chosen length", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Start a solo timer" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: "45 min" }));
    await user.click(within(dialog).getByRole("button", { name: "Start focusing" }));
    expect(await screen.findByRole("listitem", { name: /You, Solo · 45:00/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End solo timer" })).toBeInTheDocument();
  });

  it("starts a solo timer with a custom length, and refuses one out of range", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Start a solo timer" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: "Custom" }));
    const field = within(dialog).getByLabelText("Minutes");
    const start = within(dialog).getByRole("button", { name: "Start focusing" });
    await user.clear(field);
    await user.type(field, "181");
    expect(start).toBeDisabled();
    await user.clear(field);
    await user.type(field, "42");
    expect(start).toBeEnabled();
    await user.click(start);
    expect(await screen.findByRole("listitem", { name: /You, Solo · 42:00/ })).toBeInTheDocument();
  });

  it("adds and completes goals, earning XP once", async () => {
    const { user } = await renderApp();
    const panel = screen.getByRole("region", { name: "Your session" });
    expect(within(panel).getByText("365 / 500 XP")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Add a goal" }));
    await user.type(within(panel).getByLabelText("New goal"), "Stats HW 5{Enter}");
    const checkbox = await within(panel).findByRole("checkbox", { name: "Stats HW 5" });
    await user.click(checkbox);
    await waitFor(() => expect(within(panel).getByText("390 / 500 XP")).toBeInTheDocument());
    await user.click(checkbox);
    await user.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(within(panel).getByText("390 / 500 XP")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Remove goal: Stats HW 5" }));
    await waitFor(() => expect(within(panel).queryByText("Stats HW 5")).not.toBeInTheDocument());
  });

  it("closes sheets with Escape and returns focus", async () => {
    const { user } = await renderApp();
    const opener = screen.getByRole("button", { name: "Room settings" });
    await user.click(opener);
    expect(screen.getByRole("dialog", { name: "Room settings" })).toHaveTextContent("25 / 5");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("mutes and unmutes sound effects from the header", async () => {
    const { user } = await renderApp();
    const button = screen.getByRole("button", { name: "Sound effects" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(window.localStorage.getItem("studysquad.soundsMuted")).toBe("1");
    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    window.localStorage.clear();
  });

  it("shows server errors without losing the room", async () => {
    const { gateway, user } = await renderApp();
    vi.spyOn(gateway, "addGoal").mockRejectedValueOnce({
      code: 1001,
      message: "You can have up to 8 open goals.",
    });
    const panel = screen.getByRole("region", { name: "Your session" });
    await user.click(within(panel).getByRole("button", { name: "Add a goal" }));
    await user.type(within(panel).getByLabelText("New goal"), "One more{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("You can have up to 8 open goals.");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  it("asks 'Keep going?' in the long break and hides it once tapped", async () => {
    const gateway = await DemoGateway.create({ bots: false, elapsedMinutes: 0 });
    const snapshot = await gateway.getSnapshot();
    const endsAt = gateway.now() + 10 * 60_000;
    vi.spyOn(gateway, "getSnapshot").mockResolvedValueOnce({
      ...snapshot,
      me: { ...snapshot.me, keepGoingEndsAt: endsAt },
    });
    const keepGoing = vi
      .spyOn(gateway, "keepGoing")
      .mockResolvedValueOnce({ ...snapshot.me, keepGoingEndsAt: 0 });
    const user = userEvent.setup();
    render(<App gateway={gateway} />);

    const prompt = await screen.findByRole("alertdialog", { name: "Keep going?" });
    expect(prompt).toHaveTextContent(/Tap within (9:59|10:00)/);
    await user.click(within(prompt).getByRole("button", { name: "Keep going" }));
    expect(keepGoing).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("offers a retry when the room can't load", async () => {
    const gateway = await DemoGateway.create({ bots: false, elapsedMinutes: 0 });
    const spy = vi.spyOn(gateway, "getSnapshot").mockRejectedValueOnce(new Error("offline"));
    render(<App gateway={gateway} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't reach Study Squad/);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("timer")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("opens the progress screen and comes back", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Your progress" }));
    expect(await screen.findByText("5 day streak")).toBeInTheDocument();
    expect(screen.getByText("1 freeze left")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Focus time, last 5 weeks" }).children).toHaveLength(
      35,
    );
    const quests = screen.getByRole("region", { name: "Weekly quests" });
    expect(within(quests).getAllByRole("progressbar")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Back to the room" }));
    expect(await screen.findByRole("timer")).toBeInTheDocument();
  });

  it("keeps progress and the leaderboard live while the room updates", async () => {
    const { gateway, user } = await renderApp();
    const progress = vi.spyOn(gateway, "getProgress");
    const leaderboard = vi.spyOn(gateway, "getLeaderboard");
    await user.click(screen.getByRole("button", { name: "Your progress" }));
    await screen.findByText("5 day streak");
    await waitFor(() => expect(leaderboard).toHaveBeenCalledTimes(1));
    expect(progress).toHaveBeenCalledTimes(1);
    // Anything that changes the room, like a focus minute ticking by, reloads both.
    await act(() => gateway.addGoal("Pushed from elsewhere"));
    await waitFor(() => expect(progress).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(leaderboard).toHaveBeenCalledTimes(2));
    expect(leaderboard).toHaveBeenLastCalledWith("minutes", "week");
  });

  it("shows badges, keeps secrets hidden, and lets you restyle your card", async () => {
    const { user } = await renderApp({ badges: ["squad-up", "first-session"] });
    await user.click(screen.getByRole("button", { name: "Your progress" }));
    const shelf = await screen.findByRole("region", { name: "Badges" });
    expect(within(shelf).getByRole("button", { name: "First Steps, earned" })).toBeInTheDocument();
    expect(within(shelf).getByRole("button", { name: "Night Owl, locked" })).toBeInTheDocument();
    expect(
      within(shelf).getAllByRole("button", { name: "Secret badge, not found yet" }).length,
    ).toBeGreaterThan(10);
    expect(within(shelf).queryByText("Three O'Clock Club")).not.toBeInTheDocument();

    await user.click(within(shelf).getByRole("button", { name: "Squad Up, earned" }));
    const detail = within(shelf).getByRole("region", { name: "Badge details" });
    expect(detail).toHaveTextContent("Finish your first round on the room timer.");
    await user.click(within(detail).getByRole("button", { name: "Show on my card" }));
    await waitFor(() =>
      expect(within(shelf).getByRole("button", { name: "Show my newest instead" })).toBeEnabled(),
    );
    expect(within(shelf).getByLabelText("On your card")).toHaveTextContent("Squad Up");

    // Level 7 in the demo: Ember is unlocked, Gold needs level 8.
    const styles = screen.getByRole("radiogroup", { name: "Card style" });
    expect(within(styles).getByRole("radio", { name: /Gold/ })).toBeDisabled();
    await user.click(within(styles).getByRole("radio", { name: /Ember/ }));
    await waitFor(() =>
      expect(within(styles).getByRole("radio", { name: /Ember/ })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
  });

  it("uses the phone layout with a bottom action bar on small screens", async () => {
    mockViewport(true);
    const { user } = await renderApp();
    const bar = screen.getByRole("navigation", { name: "Session" });
    await user.click(within(bar).getByRole("button", { name: "Start focusing" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Start focusing" }),
    );
    await waitFor(() =>
      expect(within(bar).getByRole("button", { name: "Leave timer" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("listitem", { name: /You, Room timer/ })).toHaveTextContent("Room");
  });

  it("celebrates and shows the break moment when the round ends", async () => {
    const { user } = await renderApp({ focusMinutes: 0.02, breakMinutes: 1 });
    await user.click(screen.getByRole("button", { name: "Join room timer" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Goals for this session"), "Read ch. 4");
    await user.click(within(dialog).getByRole("button", { name: "Start focusing" }));
    const breakSheet = await screen.findByRole("dialog", { name: "Nice work" }, { timeout: 4_000 });
    expect(breakSheet).toHaveTextContent("Round 1 complete");
    expect(breakSheet).toHaveTextContent("6 days");
    expect(
      screen.getAllByRole("status").some((s) => s.textContent?.includes("Round 1 complete")),
    ).toBe(true);
    // Finishing your first round earns your first badges live, each with its
    // own full-screen moment, on top of the break sheet.
    const unlocked: string[] = [];
    await screen.findByRole("button", { name: "Nice!" });
    while (screen.queryByRole("button", { name: "Nice!" })) {
      unlocked.push(screen.getByRole("heading", { level: 2 }).textContent ?? "");
      await user.click(screen.getByRole("button", { name: "Nice!" }));
    }
    expect(unlocked).toEqual(expect.arrayContaining(["First Steps", "Squad Up"]));
    await act(async () => {
      await user.click(within(breakSheet).getByRole("button", { name: /Done/ }));
    });
    // Checking the goal off earns more badges. Tap through each of their moments.
    for (;;) {
      const nice = await screen.findByRole("button", { name: "Nice!" }).catch(() => null);
      if (!nice) break;
      await user.click(nice);
    }
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(
      within(screen.getByRole("region", { name: "Your session" })).getByRole("checkbox", {
        name: "Read ch. 4",
      }),
    ).toBeChecked();
  });

  it("still plays the unlock when the badge push never arrives", async () => {
    const gateway = await DemoGateway.create({ bots: false, elapsedMinutes: 0 });
    // Like a Root connection that drops the separate badge and status pushes:
    // only the reply to your own action gets through.
    const subscribe = gateway.subscribe.bind(gateway);
    vi.spyOn(gateway, "subscribe").mockImplementation((handlers) =>
      subscribe({ ...handlers, badgesEarned: () => {}, myStatus: () => {} }),
    );
    const user = userEvent.setup();
    render(<App gateway={gateway} />);
    await screen.findByRole("timer");
    const panel = screen.getByRole("region", { name: "Your session" });
    await user.click(within(panel).getByRole("button", { name: "Add a goal" }));
    await user.type(within(panel).getByLabelText("New goal"), "Answer one email{Enter}");
    await user.click(await within(panel).findByRole("checkbox", { name: "Answer one email" }));
    const unlocked: string[] = [];
    await screen.findByRole("button", { name: "Nice!" });
    while (screen.queryByRole("button", { name: "Nice!" })) {
      const moment = screen.getByRole("button", { name: "Nice!" }).closest("[role=dialog]");
      unlocked.push(moment?.querySelector("h2")?.textContent ?? "");
      await user.click(screen.getByRole("button", { name: "Nice!" }));
    }
    expect(unlocked).toEqual(expect.arrayContaining(["Checked Off", "Speedrun"]));
  });

  it("plays a finished timer's unlocks from the break result alone", async () => {
    const gateway = await DemoGateway.create({
      bots: false,
      elapsedMinutes: 0,
      focusMinutes: 0.02,
      breakMinutes: 1,
    });
    // Only the break result gets through: no badge or status push.
    const subscribe = gateway.subscribe.bind(gateway);
    vi.spyOn(gateway, "subscribe").mockImplementation((handlers) =>
      subscribe({ ...handlers, badgesEarned: () => {}, myStatus: () => {} }),
    );
    const user = userEvent.setup();
    render(<App gateway={gateway} />);
    await user.click(await screen.findByRole("button", { name: "Join room timer" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Start focusing" }));
    await screen.findByRole("dialog", { name: "Nice work" }, { timeout: 4_000 });
    const unlocked: string[] = [];
    await screen.findByRole("button", { name: "Nice!" });
    while (screen.queryByRole("button", { name: "Nice!" })) {
      const moment = screen.getByRole("button", { name: "Nice!" }).closest("[role=dialog]");
      unlocked.push(moment?.querySelector("h2")?.textContent ?? "");
      await user.click(screen.getByRole("button", { name: "Nice!" }));
    }
    expect(unlocked).toEqual(expect.arrayContaining(["First Steps", "Squad Up"]));
  });

  it("deletes my data after a confirmation and starts fresh", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Join room timer" }));
    await user.type(
      within(screen.getByRole("dialog")).getByLabelText("Goals for this session"),
      "Delete me",
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Start focusing" }),
    );
    await screen.findByRole("listitem", { name: /You, Room timer/ });

    await user.click(screen.getByRole("button", { name: "Your progress" }));
    await user.click(await screen.findByRole("button", { name: "Delete my data" }));
    const confirm = screen.getByRole("alertdialog", { name: "Confirm delete" });
    expect(confirm).toHaveTextContent("can't be undone");
    await user.click(within(confirm).getByRole("button", { name: "Delete everything" }));

    expect(await screen.findByRole("timer")).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: /You,/ })).not.toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "Your session" });
    expect(within(panel).getByText("0 / 200 XP")).toBeInTheDocument();
    expect(within(panel).queryByText("Delete me")).not.toBeInTheDocument();
  });

  it("can cancel deleting my data", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Your progress" }));
    await user.click(await screen.findByRole("button", { name: "Delete my data" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Delete my data" })).toBeInTheDocument();
    expect(screen.getByText("5 day streak")).toBeInTheDocument();
  });
});
