import { describe, expect, it, vi } from "vitest";
import { feedbackTitle, handleFeedback, type RelayEnv } from "../lib/relay";

const ENV: RelayEnv = { GITHUB_TOKEN: "gh", GITHUB_REPO: "sam/feedback", RELAY_KEY: "secret" };
const NOW = Date.UTC(2026, 10, 4, 15);

function request(body: unknown, key = "secret") {
  return new Request("https://relay.test/api/feedback", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function fakeGitHub(existing: { created_at: string }[] = [], createStatus = 201) {
  return vi.fn(async (url: string, init: RequestInit) => {
    if (init.method === "POST") return new Response("{}", { status: createStatus });
    expect(url).toContain("since=2026-11-04T00:00:00.000Z");
    return new Response(JSON.stringify(existing), { status: 200 });
  });
}

describe("feedback relay", () => {
  it("opens an issue with only the note and when it was sent", async () => {
    const fetchFn = fakeGitHub();
    const res = await handleFeedback(
      request({ text: " More boss names\nplease ", sentAt: Date.UTC(2026, 10, 4, 12) }),
      ENV,
      fetchFn,
      NOW,
    );
    expect(res.status).toBe(201);
    const [url, init] = fetchFn.mock.calls[1]!;
    expect(url).toBe("https://api.github.com/repos/sam/feedback/issues");
    expect(init.headers).toMatchObject({ Authorization: "Bearer gh" });
    expect(JSON.parse(String(init.body))).toEqual({
      title: "Feedback: More boss names",
      body: "More boss names\nplease\n\n--\nSent from Study Squad on 2026-11-04T12:00:00.000Z",
    });
  });

  it("refuses callers without the key", async () => {
    const fetchFn = fakeGitHub();
    expect((await handleFeedback(request({ text: "hi" }, "wrong"), ENV, fetchFn, NOW)).status).toBe(
      401,
    );
    const noAuth = new Request("https://relay.test/api/feedback", { method: "POST", body: "{}" });
    expect((await handleFeedback(noAuth, ENV, fetchFn, NOW)).status).toBe(401);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("stays shut until it is fully configured", async () => {
    const fetchFn = fakeGitHub();
    for (const env of [
      { ...ENV, GITHUB_TOKEN: "" },
      { ...ENV, RELAY_KEY: undefined },
      { ...ENV, GITHUB_REPO: "../x" },
    ]) {
      expect((await handleFeedback(request({ text: "hi" }), env, fetchFn, NOW)).status).toBe(503);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects empty, long or malformed notes", async () => {
    const fetchFn = fakeGitHub();
    const status = async (body: unknown) =>
      (await handleFeedback(request(body), ENV, fetchFn, NOW)).status;
    expect(await status({ text: "   " })).toBe(400);
    expect(await status({ text: "x".repeat(1001) })).toBe(400);
    expect(await status({ text: 5 })).toBe(400);
    expect(await status("not json")).toBe(400);
    expect(await status({ text: "x".repeat(9000) })).toBe(413);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("stops at the daily cap, counting only issues opened today", async () => {
    const today = Array.from({ length: 3 }, () => ({ created_at: "2026-11-04T09:00:00Z" }));
    const older = { created_at: "2026-11-01T09:00:00Z" };
    const env = { ...ENV, DAILY_CAP: "3" };
    expect(
      (await handleFeedback(request({ text: "hi" }), env, fakeGitHub(today), NOW)).status,
    ).toBe(429);
    expect(
      (
        await handleFeedback(
          request({ text: "hi" }),
          env,
          fakeGitHub([...today.slice(1), older]),
          NOW,
        )
      ).status,
    ).toBe(201);
  });

  it("reports GitHub failures so the app retries later", async () => {
    const res = await handleFeedback(request({ text: "hi" }), ENV, fakeGitHub([], 401), NOW);
    expect(res.status).toBe(502);
  });

  it("keeps titles short", () => {
    expect(feedbackTitle("x".repeat(100))).toBe(`Feedback: ${"x".repeat(59)}…`);
  });
});
