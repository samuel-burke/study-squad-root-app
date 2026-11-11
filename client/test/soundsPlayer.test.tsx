import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MyStatusKind } from "@studyroom/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRACKS as BUNDLED, type Track } from "../src/lib/library";
import { nextTrack, queueOf, useSounds } from "../src/state/useSounds";
import { MiniPlayer, SoundsSheet, clock } from "../src/components/SoundsSheet";

// Records what each channel was told to play instead of touching Web Audio.
const calls = vi.hoisted(() => ({
  channels: [] as { set: ReturnType<typeof vi.fn>; onEnded: () => void }[],
}));
vi.mock("../src/lib/audioChannel", () => ({
  AudioChannel: class {
    set = vi.fn();
    constructor(public onEnded: () => void = () => {}) {
      calls.channels.push(this);
    }
  },
}));

const track = (id: string, genre = "Lo-fi"): Track => ({
  id,
  title: `Track ${id}`,
  artist: "HoliznaCC0",
  album: "Public Domain Lofi",
  genre,
  src: `/music/${id}.mp3`,
  seconds: 125,
});
const TRACKS = [track("a"), track("b"), track("c", "Piano")];

beforeEach(() => {
  calls.channels = [];
});
afterEach(() => window.localStorage.clear());

describe("library", () => {
  it("bundles every music file with a title, mood and length", () => {
    expect(BUNDLED.length).toBeGreaterThanOrEqual(20);
    for (const t of BUNDLED) {
      expect(t.src).toBeTruthy();
      expect(t.title).toBeTruthy();
      expect(t.seconds).toBeGreaterThan(60);
    }
    expect(new Set(BUNDLED.map((t) => t.genre)).size).toBeGreaterThan(1);
  });

  it.each(["ambient", "music"])("credits every bundled %s file", (folder) => {
    const dir = join(__dirname, "../src/assets", folder);
    const credits = readFileSync(join(dir, "CREDITS.md"), "utf8");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".mp3"))) {
      expect(credits).toContain(`\`${f}\``);
    }
  });
});

describe("queue", () => {
  it("filters by genre", () => {
    expect(queueOf(TRACKS, "All")).toHaveLength(3);
    expect(queueOf(TRACKS, "Piano").map((t) => t.id)).toEqual(["c"]);
  });

  it("steps forward and back with wraparound", () => {
    expect(nextTrack(TRACKS, "a", 1, false)?.id).toBe("b");
    expect(nextTrack(TRACKS, "c", 1, false)?.id).toBe("a");
    expect(nextTrack(TRACKS, "a", -1, false)?.id).toBe("c");
    expect(nextTrack([], "a", 1, false)).toBeNull();
  });

  it("shuffles to a different track", () => {
    expect(nextTrack(TRACKS, "a", 1, true, () => 0)?.id).toBe("b");
    expect(nextTrack(TRACKS, "a", 1, true, () => 0.99)?.id).toBe("c");
  });
});

describe("useSounds", () => {
  function setup(initial: MyStatusKind | null) {
    const hook = renderHook(({ status }) => useSounds(status, TRACKS), {
      initialProps: { status: initial },
    });
    const [music, ambience] = calls.channels;
    return { music: music!, ambience: ambience!, ...hook };
  }
  const lastSet = (c: { set: ReturnType<typeof vi.fn> }) => c.set.mock.calls.at(-1);

  it("stays silent until you press play", async () => {
    const { result, music, ambience } = setup("roomFocus");
    expect(lastSet(ambience)?.[2]).toBe(false);
    expect(result.current.track?.id).toBe("a");
    expect(lastSet(music)?.[2]).toBe(false);
    act(() => result.current.togglePlay());
    expect(lastSet(music)).toEqual(["/music/a.mp3", 0.5, true]);
  });

  it("plays ambience only while focusing, and pauses everything on breaks", async () => {
    window.localStorage.setItem("studysquad.sounds", JSON.stringify({ ambience: "rain" }));
    const { result, rerender, music, ambience } = setup("idle");
    expect(lastSet(ambience)?.[2]).toBe(false);
    rerender({ status: "soloFocus" });
    expect(lastSet(ambience)?.slice(1)).toEqual([0.3, true, true]);
    act(() => result.current.togglePlay());
    rerender({ status: "roomBreak" });
    expect(lastSet(ambience)?.[2]).toBe(false);
    expect(lastSet(music)?.[2]).toBe(false);
    act(() => result.current.update({ pauseOnBreaks: false }));
    expect(lastSet(ambience)?.[2]).toBe(true);
    expect(lastSet(music)?.[2]).toBe(true);
  });

  it("moves to the next track when one ends", async () => {
    const { result, music } = setup("idle");
    act(() => music.onEnded());
    expect(result.current.track?.id).toBe("b");
  });

  it("saves settings on this device and ignores unknown ambience", () => {
    const { result } = setup("idle");
    act(() => result.current.update({ ambience: "cafe", musicVolume: 80 }));
    expect(JSON.parse(window.localStorage.getItem("studysquad.sounds")!)).toMatchObject({
      ambience: "cafe",
      musicVolume: 80,
    });
    window.localStorage.setItem("studysquad.sounds", JSON.stringify({ ambience: "thunder" }));
    expect(setup("idle").result.current.settings.ambience).toBe("off");
  });

  it("fades both channels out when the room screen goes away", () => {
    const { unmount, music, ambience } = setup("roomFocus");
    unmount();
    expect(lastSet(music)).toEqual([null, 0, false]);
    expect(lastSet(ambience)).toEqual([null, 0, false]);
  });
});

describe("SoundsSheet", () => {
  function Harness({ tracks }: { tracks: Track[] }) {
    const sounds = useSounds("roomFocus", tracks);
    return (
      <>
        <MiniPlayer sounds={sounds} />
        <SoundsSheet
          sounds={sounds}
          effectsOn
          onEffects={() => {}}
          onClose={() => {}}
          wide={false}
        />
      </>
    );
  }

  it("lists tracks, plays one, and shows the mini player", async () => {
    const user = userEvent.setup();
    render(<Harness tracks={TRACKS} />);
    const tracks = await screen.findByRole("list", { name: "Tracks" });
    expect(within(tracks).getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByRole("region", { name: "Now playing" })).not.toBeInTheDocument();

    await user.click(within(tracks).getByRole("button", { name: /Track b/ }));
    const mini = screen.getByRole("region", { name: "Now playing" });
    expect(mini).toHaveTextContent("Track b");

    await user.click(screen.getByRole("button", { name: "Piano" }));
    expect(within(tracks).getAllByRole("button")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Storm" }));
    expect(screen.getByRole("button", { name: "Storm" })).toHaveAttribute("aria-pressed", "true");
  });

  it("formats times", () => {
    expect(clock(125)).toBe("2:05");
    expect(clock(-3)).toBe("0:00");
  });
});
