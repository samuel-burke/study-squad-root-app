import { Sheet } from "./Sheet";

/**
 * Placeholder for in-app feedback. Sending isn't built yet, so the form is
 * shown but can't be filled in or submitted.
 */
export function FeedbackSheet({ onClose }: { onClose(): void }) {
  return (
    <Sheet labelledBy="feedback-title" onClose={onClose}>
      <h1 id="feedback-title">Send feedback</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label className="field">
          <span className="small muted">
            Ideas, bugs, anything. Sending feedback from the app is coming soon.
          </span>
          <textarea
            className="input"
            rows={5}
            disabled
            placeholder="Coming soon"
            aria-describedby="feedback-soon"
          />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled>
            <span id="feedback-soon">Coming soon</span>
          </button>
          <button
            type="button"
            className="btn"
            style={{ flex: 1 }}
            onClick={onClose}
            data-autofocus
          >
            Close
          </button>
        </div>
      </div>
    </Sheet>
  );
}
