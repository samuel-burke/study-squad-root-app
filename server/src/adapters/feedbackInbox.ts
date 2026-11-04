import fs from "node:fs";
import path from "node:path";
import type { FeedbackInbox, FeedbackRecord } from "@studyroom/core";

/**
 * Where feedback goes: issues in one private GitHub repo. Root has no secret
 * storage, so this is baked into the package at build time
 * (scripts/feedback-config.mjs) and never committed.
 */
export interface FeedbackDestination {
  /** A fine-grained token with only Issues read/write on `repo`. */
  token: string;
  /** "owner/name" of a private repo. */
  repo: string;
}

/** Written next to main.js by the server build. */
export const FEEDBACK_CONFIG_FILE = "feedback.json";

const REPO = /^[A-Za-z0-9-]+\/(?!\.)[A-Za-z0-9_.-]+$/;

function parseDestination(raw: Record<string, unknown>): FeedbackDestination | null {
  const str = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string).trim() : "");
  const token = str("githubToken");
  const repo = str("githubRepo");
  return token && REPO.test(repo) ? { token, repo } : null;
}

/**
 * Reads the destination from FEEDBACK_GITHUB_* environment variables, else from
 * the file the build wrote. Returns null when nothing is set, which hides the box.
 */
export function loadFeedbackDestination(
  env: Record<string, string | undefined>,
  dir: string,
): FeedbackDestination | null {
  const fromEnv = parseDestination({
    githubToken: env.FEEDBACK_GITHUB_TOKEN,
    githubRepo: env.FEEDBACK_GITHUB_REPO,
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

/** The note's first line, shortened, for the issue title. */
export function feedbackTitle(text: string): string {
  const first = text.split("\n")[0]!.trim();
  return `Feedback: ${first.length > 60 ? `${first.slice(0, 59)}…` : first}`;
}

/**
 * Opens one issue per note, anonymously: only the text and when it was sent.
 * No name, user id or community leaves the app.
 */
export class GitHubFeedbackInbox implements FeedbackInbox {
  constructor(
    private readonly destination: FeedbackDestination,
    private readonly fetchFn: Fetch = fetch,
  ) {}

  async deliver(note: FeedbackRecord): Promise<void> {
    const { token, repo } = this.destination;
    const response = await this.fetchFn(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "study-squad-feedback",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: feedbackTitle(note.text),
        body: `${note.text}\n\n--\nSent from Study Squad on ${new Date(note.createdAt).toISOString()}`,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new Error(`GitHub answered ${response.status}: ${detail}`);
    }
  }
}
