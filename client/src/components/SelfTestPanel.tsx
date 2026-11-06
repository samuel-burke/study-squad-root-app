import { useCallback, useEffect, useRef, useState } from "react";
import {
  toGatewayError,
  type SelfTestApi,
  type SelfTestCheck,
  type SelfTestState,
} from "../api/gateway";

const POLL_MS = 3_000;
const ICON: Record<SelfTestCheck["status"], string> = {
  pass: "✓",
  warn: "!",
  fail: "✗",
  pending: "…",
};
const TONE: Record<SelfTestCheck["status"], string> = {
  pass: "var(--teal-text)",
  warn: "var(--amber-text)",
  fail: "var(--coral-text)",
  pending: "var(--muted, inherit)",
};

/**
 * The owner-only self-test, in Room settings. It runs live checks against
 * Root (versions, settings shapes, database, a push to this screen, a job,
 * channels, members) and copies a report. The server checks the caller on
 * every call; this only decides what to draw.
 *
 * Admins see their own Root user id here while nobody is on the list, so the
 * developer can find theirs.
 */
export function SelfTestPanel({ selfTest }: { selfTest: SelfTestApi }) {
  const [state, setState] = useState<SelfTestState | null>(null);
  const [testPost, setTestPost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"copied" | "select" | null>(null);
  const reportText = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let live = true;
    selfTest
      .get()
      .then((s) => live && setState(s))
      .catch(() => live && setState(null));
    return () => {
      live = false;
    };
  }, [selfTest]);

  // Jobs and the ping finish after the run returns, so keep asking.
  const report = state?.report;
  const waiting = !!report && !report.done;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      selfTest
        .get()
        .then(setState)
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [selfTest, waiting]);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    setCopied(null);
    try {
      setState(await selfTest.run(testPost));
    } catch (e) {
      setError(toGatewayError(e).message);
    } finally {
      setBusy(false);
    }
  }, [selfTest, testPost]);

  const copy = useCallback(async () => {
    if (!report) return;
    const text = JSON.stringify({ ...report, client: await selfTest.clientInfo() }, null, 2);
    if (reportText.current) reportText.current.value = text;
    try {
      await navigator.clipboard.writeText(text);
      setCopied("copied");
    } catch {
      // Root's webview may not allow the clipboard: show the text to copy by hand.
      setCopied("select");
      requestAnimationFrame(() => reportText.current?.select());
    }
  }, [report, selfTest]);

  if (!state) return null;
  if (!state.allowed) {
    if (!state.unconfigured) return null;
    return (
      <div className="tiny dim">
        Your Root user id is <code>{state.yourUserId}</code> and this community&apos;s id is{" "}
        <code>{state.yourCommunityId}</code>. Put them in SELF_TEST_USER_IDS and
        SELF_TEST_COMMUNITY_IDS to open the self-test panel in this community only (see
        docs/TESTING.md).
      </div>
    );
  }

  return (
    <section
      aria-label="Self-test"
      className="field"
      style={{ borderTop: "1px solid var(--line, rgba(127,127,127,.25))", paddingTop: 12 }}
    >
      <div className="row-between">
        <h2 style={{ margin: 0, fontSize: 16 }}>Self-test</h2>
        <span className="tiny dim">Only you can see this</span>
      </div>
      <label className="row-between small" style={{ gap: 8 }}>
        <span>Also send a test post to the bot channel</span>
        <input
          type="checkbox"
          checked={testPost}
          onChange={(e) => setTestPost(e.target.checked)}
          disabled={busy}
        />
      </label>
      <button type="button" className="btn btn-teal" onClick={() => void run()} disabled={busy}>
        {busy ? "Running…" : report ? "Run again" : "Run self-test"}
      </button>
      {error && (
        <div role="alert" className="tiny" style={{ color: "var(--coral)" }}>
          {error}
        </div>
      )}
      {report && (
        <>
          <div className="tiny dim" aria-live="polite">
            {report.app.version} · {new Date(report.startedAt).toLocaleTimeString()} ·{" "}
            {waiting ? "still waiting on some checks" : summary(report.checks)}
          </div>
          <ul aria-label="Self-test results" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {report.checks.map((c) => (
              <li
                key={c.id}
                aria-label={`${c.title}: ${c.status}`}
                style={{ display: "flex", gap: 8, padding: "6px 0" }}
              >
                <span aria-hidden style={{ color: TONE[c.status], fontWeight: 800, width: 14 }}>
                  {ICON[c.status]}
                </span>
                <span>
                  <span className="small" style={{ fontWeight: 700 }}>
                    {c.title}
                  </span>
                  <span className="tiny dim" style={{ display: "block" }}>
                    {c.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-quiet" onClick={() => void copy()}>
            {copied === "copied" ? "Copied" : "Copy report"}
          </button>
          <textarea
            ref={reportText}
            aria-label="Self-test report"
            readOnly
            hidden={copied !== "select"}
            className="input"
            rows={6}
            style={{ fontFamily: "monospace", fontSize: 11 }}
          />
        </>
      )}
    </section>
  );
}

function summary(checks: SelfTestCheck[]): string {
  const count = (s: SelfTestCheck["status"]) => checks.filter((c) => c.status === s).length;
  const failed = count("fail");
  const warned = count("warn");
  if (failed === 0 && warned === 0) return `all ${checks.length} passed`;
  return [failed && `${failed} failed`, warned && `${warned} to look at`]
    .filter(Boolean)
    .join(", ");
}
