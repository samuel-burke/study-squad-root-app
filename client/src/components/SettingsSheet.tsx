import { presetLabel, type RoomStateDto, type VoiceChannelChoiceDto } from "@studyroom/core";
import { useEffect, useState } from "react";
import { toGatewayError, type StudyRoomGateway } from "../api/gateway";
import { SUPPORT } from "../lib/support";
import { Sheet } from "./Sheet";

/**
 * Summary of the room's rules. Admins change most of them in Root's App
 * settings, which Root already restricts to people allowed to manage apps.
 * The voice channel is the exception: Root's channel picker only lists text
 * channels, so admins pick it here from the community's voice channels.
 */
export function SettingsSheet({
  room,
  gateway,
  onClose,
  onSendFeedback,
}: {
  room: RoomStateDto;
  gateway: StudyRoomGateway;
  onClose(): void;
  onSendFeedback(): void;
}) {
  const f = room.features;
  const rows: [string, string][] = [
    [
      "Room timer",
      `${presetLabel(room.timer.preset)} · rounds of ${room.timer.rounds}, then a long break`,
    ],
    [
      "Goals",
      f.goalsPublicByDefault
        ? "Shown by default. You can make yours private."
        : "Private by default.",
    ],
    ["XP and levels", f.xpEnabled ? "On · 2 XP per focus minute, +25 per goal" : "Off"],
    ["Combo multiplier", f.comboEnabled ? "On · +0.1x per extra person, up to 2.0x" : "Off"],
    ["Weekly boss", f.bossEnabled ? `On · ${room.boss.name}` : "Off"],
    ["Streak freezes", f.streakFreezesEnabled ? "One free missed day per week" : "Off"],
    [
      "Bot messages channel",
      f.postChannelName ? `#${f.postChannelName}` : "None picked, so posts are off",
    ],
  ];
  const voiceStatus = f.voiceChannelStatus || "None set, so the Join voice button is hidden";
  return (
    <Sheet labelledBy="settings-title" onClose={onClose}>
      <h1 id="settings-title">Room settings</h1>
      <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map(([label, value]) => (
          <div key={label} className="row-between" style={{ alignItems: "flex-start" }}>
            <dt className="small muted" style={{ fontWeight: 700 }}>
              {label}
            </dt>
            <dd style={{ margin: 0, textAlign: "right", fontSize: 14 }}>{value}</dd>
          </div>
        ))}
        <VoiceChannelSetting gateway={gateway} status={voiceStatus} />
      </dl>
      <div className="tiny dim">
        Community admins can change these in App settings for Study Squad.
      </div>
      <div className="small muted">
        Need help? Email{" "}
        <a
          href={`mailto:${SUPPORT.email}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--text)" }}
        >
          {SUPPORT.email}
        </a>{" "}
        or message <strong>{SUPPORT.rootUsername}</strong> on Root.
      </div>
      {f.feedbackEnabled && (
        <button type="button" className="btn btn-quiet" onClick={onSendFeedback}>
          Send feedback
        </button>
      )}
      <button type="button" className="btn" onClick={onClose} data-autofocus>
        Close
      </button>
    </Sheet>
  );
}

/**
 * The voice channel row. Everyone sees how it resolved; admins also get a
 * dropdown of the community's voice channels and a Save button.
 */
function VoiceChannelSetting({ gateway, status }: { gateway: StudyRoomGateway; status: string }) {
  const [choice, setChoice] = useState<VoiceChannelChoiceDto | null>(null);
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    gateway
      .getVoiceChannels()
      .then((c) => {
        if (!live) return;
        setChoice(c);
        setPicked(c.selectedId);
      })
      .catch((e: unknown) => live && setError(toGatewayError(e).message));
    return () => {
      live = false;
    };
  }, [gateway]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const c = await gateway.setVoiceChannel(picked);
      setChoice(c);
      setPicked(c.selectedId);
      setSaved(true);
    } catch (e) {
      setError(toGatewayError(e).message);
    } finally {
      setBusy(false);
    }
  }

  const row = (
    <div className="row-between" style={{ alignItems: "flex-start" }}>
      <dt className="small muted" style={{ fontWeight: 700 }}>
        Voice channel
      </dt>
      <dd style={{ margin: 0, textAlign: "right", fontSize: 14 }}>{status}</dd>
    </div>
  );
  if (!choice?.canEdit) {
    return (
      <>
        {row}
        {error && (
          <div role="alert" className="tiny" style={{ color: "var(--coral)" }}>
            {error}
          </div>
        )}
      </>
    );
  }

  // Keep a saved pick in the list even if Root stopped returning it.
  const known = choice.channels.some((c) => c.id === choice.selectedId);
  return (
    <div className="field">
      {row}
      <form
        className="row-between"
        style={{ gap: 8 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) void save();
        }}
      >
        <select
          className="input"
          aria-label="Voice channel"
          value={picked}
          disabled={busy}
          style={{ flex: 1, minWidth: 0 }}
          onChange={(event) => {
            setPicked(event.target.value);
            setSaved(false);
          }}
        >
          <option value="">No voice channel picked</option>
          {!known && choice.selectedId && (
            <option value={choice.selectedId}>Missing channel</option>
          )}
          {choice.channels.map((c) => (
            <option key={c.id} value={c.id}>
              {`#${c.name}`}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || picked === choice.selectedId}
        >
          {busy ? "Saving" : "Save"}
        </button>
      </form>
      {choice.channels.length === 0 && (
        <span className="tiny dim">
          Study Squad can't see any voice channels. Give it access to one in Root, then reopen this.
        </span>
      )}
      {saved && (
        <span role="status" className="tiny dim">
          Saved. Everyone now gets this voice channel.
        </span>
      )}
      {error && (
        <div role="alert" className="tiny" style={{ color: "var(--coral)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
