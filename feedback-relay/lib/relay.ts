import { timingSafeEqual } from "node:crypto";

/**
 * Settings, from the Vercel project's environment variables. The GitHub token
 * lives only here, never in the app package.
 */
export interface RelayEnv {
  /** Fine-grained token with only Issues read/write on GITHUB_REPO. */
  GITHUB_TOKEN?: string;
  /** "owner/name" of the private repo that collects notes. */
  GITHUB_REPO?: string;
  /** Shared key the app sends, so only Study Squad can post here. */
  RELAY_KEY?: string;
  /** Most notes accepted per UTC day, from all communities together. Default 50. */
  DAILY_CAP?: string;
  /** Optional Slack incoming webhook that gets a ping for each new note. */
  SLACK_WEBHOOK_URL?: string;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export const MAX_NOTE_LENGTH = 1000;
const DEFAULT_DAILY_CAP = 50;
const MAX_BODY_BYTES = 8 * 1024;
const TIMEOUT_MS = 10_000;
const REPO = /^[A-Za-z0-9-]+\/(?!\.)[A-Za-z0-9_.-]+$/;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function sameKey(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The note's first line, shortened, for the issue title. */
export function feedbackTitle(text: string): string {
  const first = text.split("\n")[0]!.trim();
  return `Feedback: ${first.length > 60 ? `${first.slice(0, 59)}…` : first}`;
}

/** Slack treats &, < and > as markup, so they're escaped. */
function slackEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Pings Slack about a new note. Best effort: the issue is already open, so a
 * Slack failure is logged and otherwise ignored.
 */
async function notifySlack(
  webhook: string,
  text: string,
  issueUrl: string | undefined,
  fetchFn: Fetch,
): Promise<void> {
  if (!webhook.startsWith("https://hooks.slack.com/")) return;
  const quoted = slackEscape(text)
    .split("\n")
    .map((line) => `>${line}`)
    .join("\n");
  const link = issueUrl ? `\n<${issueUrl}|Open the issue>` : "";
  try {
    const res = await fetchFn(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `New Study Squad feedback\n${quoted}${link}` }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) console.warn(`Slack answered ${res.status}`);
  } catch (error) {
    console.warn("Slack notification failed", error);
  }
}

/** Midnight UTC at the start of `now`'s day. */
function startOfUtcDay(now: number): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

/**
 * Checks the key and the note, enforces the daily cap, opens one issue and,
 * if a Slack webhook is set, pings Slack. Only the note's text and when it was
 * sent go anywhere.
 */
export async function handleFeedback(
  request: Request,
  env: RelayEnv,
  fetchFn: Fetch = fetch,
  now: number = Date.now(),
): Promise<Response> {
  const token = env.GITHUB_TOKEN?.trim() ?? "";
  const repo = env.GITHUB_REPO?.trim() ?? "";
  const key = env.RELAY_KEY?.trim() ?? "";
  if (!token || !REPO.test(repo) || !key) return json(503, { error: "relay not configured" });

  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !sameKey(auth.slice(7), key)) {
    return json(401, { error: "unauthorized" });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return json(413, { error: "too large" });
  let note: { text?: unknown; sentAt?: unknown };
  try {
    note = JSON.parse(raw) as typeof note;
  } catch {
    return json(400, { error: "invalid JSON" });
  }
  const text = typeof note?.text === "string" ? note.text.trim() : "";
  if (!text || text.length > MAX_NOTE_LENGTH) return json(400, { error: "invalid text" });
  const sentAt =
    typeof note.sentAt === "number" && Number.isFinite(note.sentAt) ? note.sentAt : now;

  const github = (path: string, init: RequestInit = {}) =>
    fetchFn(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "study-squad-feedback-relay",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  // The daily cap: count today's issues, so a flood can't bury the repo.
  const cap = Number.parseInt(env.DAILY_CAP ?? "", 10) || DEFAULT_DAILY_CAP;
  const since = startOfUtcDay(now);
  const listed = await github(`/issues?state=all&since=${since}&per_page=100`);
  if (!listed.ok) return json(502, { error: `GitHub answered ${listed.status}` });
  const issues = (await listed.json()) as { created_at?: string }[];
  const today = issues.filter((i) => (i.created_at ?? "") >= since).length;
  if (today >= cap) return json(429, { error: "daily limit reached" });

  const created = await github("/issues", {
    method: "POST",
    body: JSON.stringify({
      title: feedbackTitle(text),
      body: `${text}\n\n--\nSent from Study Squad on ${new Date(sentAt).toISOString()}`,
    }),
  });
  if (!created.ok) return json(502, { error: `GitHub answered ${created.status}` });
  const issue = (await created.json().catch(() => ({}))) as { html_url?: string };
  const webhook = env.SLACK_WEBHOOK_URL?.trim();
  if (webhook) await notifySlack(webhook, text, issue.html_url, fetchFn);
  return json(201, { ok: true });
}
