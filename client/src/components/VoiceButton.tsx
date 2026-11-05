import type { VoiceDto } from "@studyroom/core";
import { useState } from "react";
import { HeadphonesIcon } from "./Icons";
import { Sheet } from "./Sheet";

/**
 * Opens the admin's voice channel in Root, so people can talk while they
 * study. Hidden until an admin picks a channel. Compact shows only the icon
 * and how many people are in there. It asks first, so a stray tap doesn't
 * drop someone into the call.
 */
export function VoiceButton({ voice, compact }: { voice: VoiceDto; compact: boolean }) {
  const [asking, setAsking] = useState(false);
  if (!voice.joinUrl) return null;
  const count = voice.userIds.length;
  const where = voice.channelName ? ` #${voice.channelName}` : "";
  const label = count > 0 ? `Join voice${where}, ${count} in there` : `Join voice${where}`;
  const who =
    count === 0
      ? "Nobody is in there yet."
      : count === 1
        ? "1 person is in there."
        : `${count} people are in there.`;
  return (
    <>
      <button
        type="button"
        className="voice-btn"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        data-compact={compact}
        onClick={() => setAsking(true)}
      >
        <HeadphonesIcon size={16} />
        {!compact && <span>Join voice</span>}
        {count > 0 && <span className="voice-count">{count}</span>}
      </button>
      {asking && (
        <Sheet labelledBy="join-voice-title" onClose={() => setAsking(false)}>
          <h1 id="join-voice-title">
            {voice.channelName ? `Join #${voice.channelName}?` : "Join voice?"}
          </h1>
          <p className="small muted" style={{ margin: 0 }}>
            This opens the voice channel in Root and joins the call. {who}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn"
              style={{ flex: 1 }}
              onClick={() => setAsking(false)}
            >
              Cancel
            </button>
            <a
              className="btn btn-primary"
              style={{ flex: 1, textDecoration: "none" }}
              href={voice.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setAsking(false)}
              data-autofocus
            >
              Join voice
            </a>
          </div>
        </Sheet>
      )}
    </>
  );
}

/** Headphones next to the name of someone in the voice channel. */
export function InVoiceMark() {
  return (
    <span className="in-voice" title="In voice" role="img" aria-label="In voice">
      <HeadphonesIcon size={13} />
    </span>
  );
}
