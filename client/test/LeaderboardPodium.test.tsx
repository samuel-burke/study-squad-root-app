import type { LeaderboardDto } from "@studyroom/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StudyRoomGateway } from "../src/api/gateway";
import { LeaderboardPodium } from "../src/components/LeaderboardPodium";

const board = (overrides: Partial<LeaderboardDto> = {}): LeaderboardDto => ({
  by: "minutes",
  period: "week",
  startDay: "2026-10-26",
  endsAt: Date.UTC(2026, 10, 2, 5),
  entries: [
    { userId: "priya", focusMinutes: 312, xp: 640, rank: 1 },
    { userId: "ana", focusMinutes: 120, xp: 150, rank: 2 },
    { userId: "kai", focusMinutes: 60, xp: 120, rank: 3 },
    { userId: "lena", focusMinutes: 45, xp: 90, rank: 4 },
    { userId: "me", focusMinutes: 30, xp: 60, rank: 5 },
  ],
  me: { rank: 5, focusMinutes: 30, xp: 60, hidden: false },
  ...overrides,
});

const NAMES: Record<string, string> = { priya: "Priya", ana: "Ana R.", kai: "Kai", lena: "Lena" };

function fakeGateway(result: () => Promise<LeaderboardDto> = async () => board()) {
  const gateway = {
    currentUserId: () => "me",
    getLeaderboard: vi.fn(result),
    getProfiles: vi.fn(async (ids: string[]) =>
      ids.map((userId) => ({ userId, name: NAMES[userId] ?? "Member" })),
    ),
  };
  return gateway as typeof gateway & StudyRoomGateway;
}

describe("LeaderboardPodium", () => {
  it("shows this week's top three by minutes on desktop and opens the full board", async () => {
    const gateway = fakeGateway();
    const onOpenLeaderboard = vi.fn();
    render(
      <LeaderboardPodium gateway={gateway} compact={false} onOpenLeaderboard={onOpenLeaderboard} />,
    );
    expect(await screen.findByRole("listitem", { name: "Rank 1, Priya, 5.2 hrs" }));
    expect(screen.getByRole("listitem", { name: "Rank 2, Ana R., 2 hrs" }));
    expect(screen.getByRole("listitem", { name: "Rank 3, Kai, 1 hr" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(gateway.getLeaderboard).toHaveBeenCalledWith("minutes", "week");
    expect(screen.getByText("You're #5 with 30 min this week.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "See the full leaderboard" }));
    expect(onOpenLeaderboard).toHaveBeenCalledTimes(1);
  });

  it("opens a member's profile from a podium row", async () => {
    const onOpenMember = vi.fn();
    render(
      <LeaderboardPodium
        gateway={fakeGateway()}
        compact={false}
        onOpenLeaderboard={() => undefined}
        onOpenMember={onOpenMember}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "View Ana R.'s profile" }));
    expect(onOpenMember).toHaveBeenCalledWith("ana");
  });

  it("is a single strip on phones that names the top three and your place", async () => {
    const onOpenLeaderboard = vi.fn();
    render(
      <LeaderboardPodium gateway={fakeGateway()} compact onOpenLeaderboard={onOpenLeaderboard} />,
    );
    const strip = await screen.findByRole("button", {
      name: "Leaderboard. This week's top 3: Priya, Ana R., Kai. You're number 5. Open the full leaderboard",
    });
    expect(strip).toHaveTextContent("You #5");
    await userEvent.click(strip);
    expect(onOpenLeaderboard).toHaveBeenCalledTimes(1);
  });

  it("leaves out your place while you're hidden", async () => {
    const gateway = fakeGateway(async () =>
      board({ me: { rank: 5, focusMinutes: 30, xp: 60, hidden: true } }),
    );
    render(<LeaderboardPodium gateway={gateway} compact onOpenLeaderboard={() => undefined} />);
    const strip = await screen.findByRole("button", { name: /^Leaderboard\./ });
    expect(strip).not.toHaveTextContent("You #");
  });

  it("invites the first session when nobody has focused this week", async () => {
    const gateway = fakeGateway(async () =>
      board({ entries: [], me: { rank: 0, focusMinutes: 0, xp: 0, hidden: false } }),
    );
    render(<LeaderboardPodium gateway={gateway} compact onOpenLeaderboard={() => undefined} />);
    expect(await screen.findByText("Be first on this week's board")).toBeInTheDocument();
  });

  it("stays out of the way if the board can't load", async () => {
    const gateway = fakeGateway(async () => {
      throw new Error("offline");
    });
    const { container } = render(
      <LeaderboardPodium gateway={gateway} compact={false} onOpenLeaderboard={() => undefined} />,
    );
    await vi.waitFor(() => expect(gateway.getLeaderboard).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
