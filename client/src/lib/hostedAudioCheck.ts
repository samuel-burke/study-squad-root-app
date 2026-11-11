import { withAudio } from "./sounds";

/** A short test tone on the music site, for the self-test's hosted audio check. */
export const TEST_TONE_URL = "https://samuel-burke.github.io/study-squad-music/test-tone.mp3";

/**
 * Checks that Root lets the app play audio from the music site: the file
 * downloads with CORS, then plays through Web Audio (the player's path).
 * Resolves with what happened; never rejects.
 */
export async function checkHostedAudio(url = TEST_TONE_URL): Promise<string> {
  try {
    const res = await fetch(url, { mode: "cors", cache: "no-store" });
    if (!res.ok) return `Download failed: HTTP ${res.status}`;
    const bytes = (await res.arrayBuffer()).byteLength;
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.src = url;
    let routed = false;
    withAudio((ctx) => {
      ctx.createMediaElementSource(audio).connect(ctx.destination);
      routed = true;
    });
    if (!routed) return `Downloaded ${bytes} bytes, but Web Audio is unavailable`;
    await Promise.race([
      audio.play(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("play timed out")), 8000)),
    ]);
    setTimeout(() => audio.pause(), 3000);
    return `Playing: downloaded ${bytes} bytes and started playback. You should hear a tone.`;
  } catch (e) {
    return `Failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}
