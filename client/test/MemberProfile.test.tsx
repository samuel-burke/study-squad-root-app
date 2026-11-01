import type { MemberCardDto, MemberProfileDto } from "@studyroom/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GatewayError, type StudyRoomGateway } from "../src/api/gateway";
import { MemberBoard } from "../src/components/MemberBoard";
import { MemberProfileSheet } from "../src/components/MemberProfileSheet";

const priya: MemberProfileDto = {
  userId: "priya",
  level: 8,
  xpTotal: 2460,
  xpIntoLevel: 10,
  xpForNextLevel: 400,
  streak: 12,
  badges: [
    { id: "first-session", earnedAt: Date.UTC(2026, 9, 1) },
    { id: "night-owl", earnedAt: Date.UTC(2026, 9, 2) },
    { id: "leet", earnedAt: Date.UTC(2026, 9, 3) },
  ],
  showcase: ["night-owl"],
  cardStyle: "gold",
};

/** Only the calls the profile makes; anything else would throw. */
function fakeGateway(overrides: Partial<StudyRoomGateway> = {}) {
  const gateway = {
    getMemberProfile: vi.fn(async () => priya),
    getProfiles: vi.fn(async (ids: string[]) => ids.map((userId) => ({ userId, name: "Priya" }))),
    ...overrides,
  };
  return gateway as typeof gateway & StudyRoomGateway;
}

function renderSheet(
  gateway: StudyRoomGateway,
  props: { you?: boolean; xpEnabled?: boolean } = {},
) {
  const onClose = vi.fn();
  render(
    <MemberProfileSheet
      gateway={gateway}
      userId="priya"
      you={props.you ?? false}
      xpEnabled={props.xpEnabled ?? true}
      onClose={onClose}
    />,
  );
  return { onClose, user: userEvent.setup() };
}

describe("MemberProfileSheet", () => {
  it("shows the member's level, XP, streak and badges", async () => {
    const gateway = fakeGateway();
    renderSheet(gateway);
    const dialog = await screen.findByRole("dialog", { name: "Priya" });
    expect(await within(dialog).findByText("12 day streak")).toBeInTheDocument();
    expect(gateway.getMemberProfile).toHaveBeenCalledWith("priya");
    expect(within(dialog).getByRole("progressbar", { name: "Level 8 progress" })).toHaveAttribute(
      "aria-valuenow",
      "10",
    );
    expect(within(dialog).getByText("2,460 XP total")).toBeInTheDocument();
    expect(within(dialog).getByText("3 earned")).toBeInTheDocument();
    const badges = within(dialog).getByRole("region", { name: "Badges" });
    // Newest first, and the one on their card is called out.
    const tiles = within(badges).getAllByRole("button");
    expect(tiles.map((t) => t.getAttribute("aria-label"))).toEqual([
      "1337",
      "Night Owl",
      "First Steps",
    ]);
    expect(within(badges).getByLabelText("On their card")).toHaveTextContent("Night Owl");
  });

  it("keeps someone else's secret badge a secret, but explains normal ones", async () => {
    const { user } = renderSheet(fakeGateway());
    const badges = await screen.findByRole("region", { name: "Badges" });
    const tiles = within(badges).getAllByRole("button");
    const secret = tiles.find((t) => t.getAttribute("data-secret") === "true")!;
    await user.click(secret);
    expect(screen.getByRole("region", { name: "Badge details" })).toHaveTextContent(
      "Nobody tells you how to get these",
    );
    const plain = tiles.find((t) => t.getAttribute("data-secret") === "false")!;
    await user.click(plain);
    expect(screen.getByRole("region", { name: "Badge details" })).not.toHaveTextContent(
      "Nobody tells you",
    );
  });

  it("hides XP when the room has it turned off", async () => {
    renderSheet(fakeGateway(), { xpEnabled: false });
    expect(await screen.findByText("Lv 8")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/XP total/)).toBeNull();
  });

  it("shows errors and closes", async () => {
    const gateway = fakeGateway({
      getMemberProfile: vi.fn(async () => {
        throw new GatewayError(8, "Slow down a little and try again.");
      }),
    });
    const { onClose, user } = renderSheet(gateway);
    expect(await screen.findByRole("alert")).toHaveTextContent("Slow down");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("opening a profile from the board", () => {
  const member = (userId: string): MemberCardDto => ({
    userId,
    status: "roomFocus",
    endsAt: 0,
    goalText: "",
    goalPrivate: true,
    level: 3,
    streak: 2,
    badges: [],
    cardStyle: "classic",
    weeklyRank: 0,
  });

  it.each([false, true])("opens the tapped member (compact: %s)", async (compact) => {
    const onOpenMember = vi.fn();
    render(
      <MemberBoard
        members={[member("me"), member("priya")]}
        profiles={new Map([["priya", { userId: "priya", name: "Priya" }]])}
        youId="me"
        now={0}
        compact={compact}
        onOpenMember={onOpenMember}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "View Priya's profile" }));
    expect(onOpenMember).toHaveBeenCalledWith("priya");
    await userEvent.click(screen.getByRole("button", { name: "View your profile" }));
    expect(onOpenMember).toHaveBeenLastCalledWith("me");
  });

  it.each([false, true])(
    "shows each member's weekly rank, and none when unranked (compact: %s)",
    (compact) => {
      render(
        <MemberBoard
          members={[
            { ...member("me"), weeklyRank: 4 },
            { ...member("priya"), weeklyRank: 1 },
            member("kai"),
          ]}
          profiles={new Map()}
          youId="me"
          now={0}
          compact={compact}
        />,
      );
      const top = screen.getByRole("img", { name: "#1 on this week's leaderboard" });
      expect(top).toHaveTextContent("#1");
      expect(top).toHaveAttribute("data-top", "true");
      expect(screen.getByRole("img", { name: "#4 on this week's leaderboard" })).toHaveAttribute(
        "data-top",
        "false",
      );
      expect(screen.getAllByRole("img", { name: /on this week's leaderboard/ })).toHaveLength(2);
    },
  );
});
