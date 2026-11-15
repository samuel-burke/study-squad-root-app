import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as UiSounds from "../src/lib/uiSounds";

const played = vi.hoisted(() => [] as string[]);
vi.mock("../src/lib/uiSounds", async (real) => ({
  ...(await real<typeof UiSounds>()),
  playUiSound: (sound: string) => played.push(sound),
}));

const { DemoGateway } = await import("../src/api/demoGateway");
const { App } = await import("../src/App");

afterEach(() => {
  played.length = 0;
});

describe("room timer chimes", () => {
  it("chimes when your break starts and when the next focus round starts", async () => {
    const gateway = await DemoGateway.create({
      bots: false,
      elapsedMinutes: 0,
      focusMinutes: 0.02,
      breakMinutes: 0.05,
    });
    const user = userEvent.setup();
    render(<App gateway={gateway} />);
    await user.click(await screen.findByRole("button", { name: "Join room timer" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Start focusing" }),
    );
    await waitFor(() => expect(played).toContain("breakStart"), { timeout: 4_000 });
    // Your own status isn't pushed when the break ends; the room's is.
    await waitFor(
      () => expect(played.slice(played.indexOf("breakStart"))).toContain("focusStart"),
      { timeout: 6_000 },
    );
  });
});
