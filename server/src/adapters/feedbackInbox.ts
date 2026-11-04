import fs from "node:fs";
import path from "node:path";
import type { FeedbackInbox, FeedbackRecord } from "@studyroom/core";

/**
 * Where feedback goes: the developer's feedback relay (feedback-relay/), which
 * holds the GitHub token and opens an issue per note. Only the relay's address
 * and key are baked into the package (scripts/feedback-config.mjs), never the
 * GitHub token, and they are never committed.
 */
export interface FeedbackDestination {
  /** The relay's https endpoint, e.g. https://example.vercel.app/api/feedback. */
  url: string;
  /** Shared key the relay checks, so only Study Squad can post to it. */
  key: string;
}

/** Written next to main.js by the server build. */
export const FEEDBACK_CONFIG_FILE = "feedback.json";

function parseDestination(raw: Record<string, unknown>): FeedbackDestination | null {
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");
  const url = str("relayUrl");
  const key = str("relayKey");
  if (!url || !key) return null;
  try {
    return new URL(url).protocol === "https:" ? { url, key } : null;
  } catch {
    return null;
  }
}

/**
 * Reads the destination from FEEDBACK_RELAY_* environment variables, else from
 * the file the build wrote. Returns null when nothing is set, which hides the box.
 */
export function loadFeedbackDestination(
  env: Record<string, string | undefined>,
  dir: string,
): FeedbackDestination | null {
  const fromEnv = parseDestination({
    relayUrl: env.FEEDBACK_RELAY_URL,
    relayKey: env.FEEDBACK_RELAY_KEY,
  });
  if (fromEnv) return fromEnv;
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(path.join(dir, FEEDBACK_CONFIG_FILE), "utf8"));
    return raw && typeof raw === "object" ? parseDestination(raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 15_000;

/**
 * Sends notes anonymously: only the text and when it was sent. No name, user
 * id or community leaves the app.
 */
export class RelayFeedbackInbox implements FeedbackInbox {
  constructor(
    private readonly destination: FeedbackDestination,
    private readonly fetchFn: Fetch = fetch,
  ) {}

  async deliver(note: FeedbackRecord): Promise<void> {
    const response = await this.fetchFn(this.destination.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.destination.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: note.text, sentAt: note.createdAt }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new Error(`feedback relay answered ${response.status}: ${detail}`);
    }
  }
}
