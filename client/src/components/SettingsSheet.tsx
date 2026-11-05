import { presetLabel, type RoomStateDto } from "@studyroom/core";
import { SUPPORT } from "../lib/support";
import { Sheet } from "./Sheet";

/**
 * Read-only summary of the room's rules. Admins change them in Root's
 * App settings, which Root already restricts to people allowed to manage apps.
 */
export function SettingsSheet({
  room,
  onClose,
  onSendFeedback,
}: {
  room: RoomStateDto;
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
    ["XP and levels", f.xpEnabled ? `On · up to ${f.dailyXpCap} XP a day` : "Off"],
    ["Combo multiplier", f.comboEnabled ? "On · +0.1x per extra person, up to 2.0x" : "Off"],
    ["Weekly boss", f.bossEnabled ? `On · ${room.boss.name}` : "Off"],
    ["Streak freezes", f.streakFreezesEnabled ? "One free missed day per week" : "Off"],
    [
      "Bot messages channel",
      f.postChannelName ? `#${f.postChannelName}` : "None picked, so posts are off",
    ],
    ["Voice channel", f.voiceChannelStatus || "None set, so the Join voice button is hidden"],
  ];
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
