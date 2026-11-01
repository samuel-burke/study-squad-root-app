import type { LeaderboardDto } from "@studyroom/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GatewayError, type StudyRoomGateway } from "../src/api/gateway";
import { WeeklyLeaderboard } from "../src/components/WeeklyLeaderboard";

const board = (overrides: Partial<LeaderboardDto> = {}): LeaderboardDto => ({
  by: "minutes",
  period: "week",
  startDay: "2026-10-26",
  endsAt: Date.UTC(2026, 10, 2, 5),
  entries: [
    { userId: "priya", focusMinutes: 312, xp: 640, rank: 1 },
    { userId: "ana", focusMinutes: 60, xp: 150, rank: 2 },
    { userId: "kai", focusMinutes: 60, xp: 120, rank: 2 },
  ],
  me: { rank: 0, focusMinutes: 0, xp: 0, hidden: false },
  ...overrides,
});

const NAMES: Record<string, string> = { priya: "Priya", ana: "Ana R.", kai: "Kai" };

/** Only the calls the leaderboard makes; anything else would throw. */
function fakeGateway(overrides: Partial<StudyRoomGateway> = {}) {
  const gateway = {
    currentUserId: () => "me",
    getLeaderboard: vi.fn(async () => board()),
    setLeaderboardHidden: vi.fn(async (hidden: boolean) =>
      board({ me: { rank: 0, focusMinutes: 15, xp: 0, hidden } }),
    ),
    getProfiles: vi.fn(async (ids: string[]) =>
      ids.map((userId) => ({ userId, name: NAMES[userId] ?? "Member" })),
    ),
    ...overrides,
  };
  return gateway as typeof gateway & StudyRoomGateway;
}

function renderBoard(gateway: StudyRoomGateway) {
  const user = userEvent.setup();
  const view = render(<WeeklyLeaderboard gateway={gateway} />);
  const region = screen.getByRole("region", { name: "Leaderboard" });
  return { user, region, view };
}

const xpBoard = board({
  by: "xp",
  entries: [
    { userId: "priya", focusMinutes: 312, xp: 640, rank: 1 },
    { userId: "ana", focusMinutes: 60, xp: 150, rank: 2 },
    { userId: "kai", focusMinutes: 60, xp: 120, rank: 3 },
  ],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("WeeklyLeaderboard", () => {
  it("lists this week's standings with names, ranks and shared ties", async () => {
    const { region } = renderBoard(fakeGateway());
    expect(within(region).getByText("Loading…")).toBeInTheDocument();
    expect(await within(region).findByRole("listitem", { name: "Rank 1, Priya, 5.2 hrs" }));
    expect(within(region).getByRole("listitem", { name: "Rank 2, Ana R., 1 hr" }));
    expect(within(region).getByRole("listitem", { name: "Rank 2, Kai, 1 hr" }));
    expect(within(region).queryByText("Loading…")).not.toBeInTheDocument();
    expect(within(region).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("marks your own row as You", async () => {
    const gateway = fakeGateway({
      currentUserId: () => "ana",
      getLeaderboard: vi.fn(async () =>
        board({ me: { rank: 2, focusMinutes: 60, xp: 0, hidden: false } }),
      ),
    });
    const { region } = renderBoard(gateway);
    const you = await within(region).findByRole("listitem", { name: "Rank 2, You, 1 hr" });
    expect(you).toHaveAttribute("data-you", "true");
    expect(within(region).getAllByRole("listitem")).toHaveLength(3);
  });

  it("adds your row under the top entries when you rank below them", async () => {
    const gateway = fakeGateway({
      getLeaderboard: vi.fn(async () =>
        board({ me: { rank: 14, focusMinutes: 25, xp: 0, hidden: false } }),
      ),
    });
    const { region } = renderBoard(gateway);
    const rows = await within(region).findAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(rows.at(-1)).toHaveAccessibleName("Rank 14, You, 25 min");
  });

  it("says so when nobody has focused yet", async () => {
    const gateway = fakeGateway({ getLeaderboard: vi.fn(async () => board({ entries: [] })) });
    const { region } = renderBoard(gateway);
    expect(await within(region).findByText(/Nobody has focused yet this week/));
    expect(within(region).queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows the server's message when the board can't load, and retries", async () => {
    const getLeaderboard = vi
      .fn<() => Promise<LeaderboardDto>>()
      .mockRejectedValueOnce(new GatewayError(8, "Slow down a little and try again."))
      .mockResolvedValueOnce(board());
    const { user, region } = renderBoard(fakeGateway({ getLeaderboard }));
    expect(await within(region).findByRole("alert")).toHaveTextContent(
      "Slow down a little and try again.",
    );
    expect(within(region).queryByText("Loading…")).not.toBeInTheDocument();
    expect(within(region).queryByRole("switch")).not.toBeInTheDocument();

    await user.click(within(region).getByRole("button", { name: "Try again" }));
    expect(await within(region).findByRole("listitem", { name: "Rank 1, Priya, 5.2 hrs" }));
    expect(within(region).queryByRole("alert")).not.toBeInTheDocument();
    expect(getLeaderboard).toHaveBeenCalledTimes(2);
  });

  it("falls back to a generic message for unexpected load failures", async () => {
    const gateway = fakeGateway({
      getLeaderboard: vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    });
    const { region } = renderBoard(gateway);
    expect(await within(region).findByRole("alert")).toHaveTextContent(
      "Couldn't reach Study Squad. Check your connection and try again.",
    );
  });

  it("hides you, then shows you again", async () => {
    const gateway = fakeGateway();
    const { user, region } = renderBoard(gateway);
    const toggle = await within(region).findByRole("switch", {
      name: "Show me on the leaderboard",
    });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await user.click(toggle);
    expect(gateway.setLeaderboardHidden).toHaveBeenLastCalledWith(true, "minutes", "week");
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
    expect(within(region).getByText(/You're hidden. Your 15 min this week still count/));

    await user.click(toggle);
    expect(gateway.setLeaderboardHidden).toHaveBeenLastCalledWith(false, "minutes", "week");
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    expect(within(region).queryByText(/You're hidden/)).not.toBeInTheDocument();
  });

  it("disables the switch while saving and keeps your setting if saving fails", async () => {
    const save = deferred<LeaderboardDto>();
    const gateway = fakeGateway({ setLeaderboardHidden: vi.fn(() => save.promise) });
    const { user, region } = renderBoard(gateway);
    const toggle = await within(region).findByRole("switch", {
      name: "Show me on the leaderboard",
    });

    await user.click(toggle);
    expect(toggle).toBeDisabled();
    save.reject(new GatewayError(13, "Something went wrong. Please try again."));

    expect(await within(region).findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute("aria-checked", "true");
    // The standings stay on screen; only the save failed.
    expect(within(region).getByRole("listitem", { name: "Rank 1, Priya, 5.2 hrs" }));
  });

  it("clears an old save error once a later save works", async () => {
    const setLeaderboardHidden = vi
      .fn<(hidden: boolean) => Promise<LeaderboardDto>>()
      .mockRejectedValueOnce(new GatewayError(13, "Something went wrong. Please try again."))
      .mockResolvedValueOnce(board({ me: { rank: 0, focusMinutes: 0, xp: 0, hidden: true } }));
    const { user, region } = renderBoard(fakeGateway({ setLeaderboardHidden }));
    const toggle = await within(region).findByRole("switch", {
      name: "Show me on the leaderboard",
    });
    await user.click(toggle);
    await within(region).findByRole("alert");
    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
    expect(within(region).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("switches between minutes and XP", async () => {
    const getLeaderboard = vi.fn(async (by: "minutes" | "xp" = "minutes") =>
      by === "xp" ? xpBoard : board(),
    );
    const gateway = fakeGateway({ getLeaderboard });
    const { user, region } = renderBoard(gateway);
    const minutes = within(region).getByRole("button", { name: "Minutes" });
    const xp = within(region).getByRole("button", { name: "XP" });
    expect(minutes).toHaveAttribute("aria-pressed", "true");
    expect(await within(region).findByRole("listitem", { name: "Rank 2, Kai, 1 hr" }));

    await user.click(xp);
    expect(xp).toHaveAttribute("aria-pressed", "true");
    expect(await within(region).findByRole("listitem", { name: "Rank 3, Kai, 120 XP" }));
    expect(within(region).getByRole("listitem", { name: "Rank 1, Priya, 640 XP" }));
    expect(getLeaderboard).toHaveBeenLastCalledWith("xp", "week");

    // Hiding yourself keeps the board you're looking at.
    await user.click(within(region).getByRole("switch", { name: "Show me on the leaderboard" }));
    expect(gateway.setLeaderboardHidden).toHaveBeenLastCalledWith(true, "xp", "week");

    await user.click(minutes);
    expect(await within(region).findByRole("listitem", { name: "Rank 1, Priya, 5.2 hrs" }));
  });

  it("shows your hidden XP and an XP empty state", async () => {
    const gateway = fakeGateway({
      getLeaderboard: vi.fn(async () =>
        board({ by: "xp", entries: [], me: { rank: 0, focusMinutes: 40, xp: 80, hidden: true } }),
      ),
    });
    const { region } = renderBoard(gateway);
    expect(await within(region).findByText(/Nobody has earned XP yet this week/));
    expect(within(region).getByText(/Your 80 XP this week still count/));
  });

  it("refreshes quietly when told to, keeping the board if a refresh fails", async () => {
    const getLeaderboard = vi
      .fn<() => Promise<LeaderboardDto>>()
      .mockResolvedValueOnce(board())
      .mockResolvedValueOnce(
        board({
          entries: [{ userId: "kai", focusMinutes: 400, xp: 800, rank: 1 }],
        }),
      )
      .mockRejectedValueOnce(new GatewayError(14, "Couldn't reach Study Squad."));
    const gateway = fakeGateway({ getLeaderboard });
    const { region, view } = renderBoard(gateway);
    await within(region).findByRole("listitem", { name: "Rank 1, Priya, 5.2 hrs" });

    view.rerender(<WeeklyLeaderboard gateway={gateway} refreshKey={1} />);
    expect(await within(region).findByRole("listitem", { name: "Rank 1, Kai, 6.7 hrs" }));

    view.rerender(<WeeklyLeaderboard gateway={gateway} refreshKey={2} />);
    await waitFor(() => expect(getLeaderboard).toHaveBeenCalledTimes(3));
    expect(within(region).getByRole("listitem", { name: "Rank 1, Kai, 6.7 hrs" }));
    expect(within(region).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a failed switch and retries the metric you picked", async () => {
    const getLeaderboard = vi
      .fn<(by?: "minutes" | "xp") => Promise<LeaderboardDto>>()
      .mockResolvedValueOnce(board())
      .mockRejectedValueOnce(new GatewayError(14, "Couldn't reach Study Squad."))
      .mockResolvedValueOnce(xpBoard);
    const { user, region } = renderBoard(fakeGateway({ getLeaderboard }));
    await within(region).findByRole("listitem", { name: "Rank 1, Priya, 5.2 hrs" });
    await user.click(within(region).getByRole("button", { name: "XP" }));
    expect(await within(region).findByRole("alert")).toHaveTextContent("Couldn't reach");
    // The minutes board stays, labelled as minutes, until XP arrives.
    expect(within(region).getByRole("listitem", { name: "Rank 1, Priya, 5.2 hrs" }));

    await user.click(within(region).getByRole("button", { name: "Try again" }));
    expect(await within(region).findByRole("listitem", { name: "Rank 1, Priya, 640 XP" }));
    expect(getLeaderboard).toHaveBeenLastCalledWith("xp", "week");
    expect(within(region).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("switches between this week, month, year and all time", async () => {
    const getLeaderboard = vi.fn(
      async (by: "minutes" | "xp" = "minutes", period: LeaderboardDto["period"] = "week") =>
        period === "all"
          ? board({
              by,
              period,
              startDay: "",
              endsAt: 0,
              entries: [{ userId: "kai", focusMinutes: 6000, xp: 9000, rank: 1 }],
              me: { rank: 0, focusMinutes: 30, xp: 60, hidden: true },
            })
          : board({ by, period }),
    );
    const gateway = fakeGateway({ getLeaderboard });
    const { user, region } = renderBoard(gateway);
    const periods = within(region).getByRole("group", { name: "Period" });
    expect(within(periods).getByRole("button", { name: "Week" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await within(region).findByRole("heading", { name: "This week" }));
    expect(within(region).getByText("Resets Monday"));

    await user.click(within(periods).getByRole("button", { name: "Month" }));
    expect(await within(region).findByRole("heading", { name: "This month" }));
    expect(within(region).getByText("Resets on the 1st"));
    expect(getLeaderboard).toHaveBeenLastCalledWith("minutes", "month");

    await user.click(within(region).getByRole("button", { name: "XP" }));
    await user.click(within(periods).getByRole("button", { name: "All time" }));
    expect(await within(region).findByRole("heading", { name: "All time" }));
    expect(getLeaderboard).toHaveBeenLastCalledWith("xp", "all");
    expect(within(region).getByRole("listitem", { name: "Rank 1, Kai, 9000 XP" }));
    expect(within(region).getByText("You're hidden. Your 60 XP still count for you and the boss."));

    // Saving the opt-out keeps the board you're looking at.
    await user.click(within(region).getByRole("switch", { name: "Show me on the leaderboard" }));
    expect(gateway.setLeaderboardHidden).toHaveBeenLastCalledWith(false, "xp", "all");
  });

  it("names the period in the empty state", async () => {
    const gateway = fakeGateway({
      getLeaderboard: vi.fn(async () => board({ period: "year", entries: [] })),
    });
    const { region } = renderBoard(gateway);
    expect(await within(region).findByText("Nobody has focused yet this year. Start a timer!"));
  });

  it("ignores a response that arrives after it has gone away", async () => {
    const load = deferred<LeaderboardDto>();
    const gateway = fakeGateway({ getLeaderboard: vi.fn(() => load.promise) });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = render(<WeeklyLeaderboard gateway={gateway} />);
    unmount();
    load.reject(new Error("late"));
    await Promise.resolve();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
