import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadFeedbackDestination, RelayFeedbackInbox } from "../src/adapters/feedbackInbox";

const URL_ = "https://relay.example/api/feedback";
const note = {
  id: "n1",
  userId: "ana",
  text: "More boss names please\nThanks",
  createdAt: Date.UTC(2026, 9, 30, 12),
  deliveredAt: null,
};

function fakeFetch(status = 201) {
  return vi.fn(async (_url: string, _init: RequestInit) => new Response("{}", { status }));
}

describe("loadFeedbackDestination", () => {
  it("prefers environment variables", () => {
    expect(
      loadFeedbackDestination({ FEEDBACK_RELAY_URL: URL_, FEEDBACK_RELAY_KEY: "k" }, "/nowhere"),
    ).toEqual({ url: URL_, key: "k" });
  });

  it("falls back to the file the build wrote, and is off without one", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-"));
    expect(loadFeedbackDestination({}, dir)).toBeNull();
    fs.writeFileSync(
      path.join(dir, "feedback.json"),
      JSON.stringify({ relayUrl: URL_, relayKey: "k" }),
    );
    expect(loadFeedbackDestination({}, dir)).toEqual({ url: URL_, key: "k" });
    fs.writeFileSync(path.join(dir, "feedback.json"), "not json");
    expect(loadFeedbackDestination({}, dir)).toBeNull();
  });

  it("needs both a key and an https address", () => {
    const load = (url: string, key: string) =>
      loadFeedbackDestination({ FEEDBACK_RELAY_URL: url, FEEDBACK_RELAY_KEY: key }, "/nowhere");
    expect(load(URL_, "")).toBeNull();
    expect(load("http://relay.example/api/feedback", "k")).toBeNull();
    expect(load("not a url", "k")).toBeNull();
  });
});

describe("RelayFeedbackInbox", () => {
  it("posts only the note and when it was sent, with the key", async () => {
    const fetchFn = fakeFetch();
    await new RelayFeedbackInbox({ url: URL_, key: "k" }, fetchFn).deliver(note);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(URL_);
    expect(init.headers).toMatchObject({ Authorization: "Bearer k" });
    expect(JSON.parse(String(init.body))).toEqual({
      text: "More boss names please\nThanks",
      sentAt: Date.UTC(2026, 9, 30, 12),
    });
    expect(String(init.body)).not.toContain("ana");
    expect(String(init.body)).not.toContain("n1");
  });

  it("throws when the relay refuses the note, so it is retried", async () => {
    const inbox = new RelayFeedbackInbox({ url: URL_, key: "k" }, fakeFetch(429));
    await expect(inbox.deliver(note)).rejects.toThrow("feedback relay answered 429");
  });
});
