import { LIMITS, type ScheduledSessionDto } from "@studyroom/core";
import { useState } from "react";
import { toGatewayError, type Profile, type StudyRoomGateway } from "../api/gateway";

interface Common {
  sessions: ScheduledSessionDto[];
  youId: string;
  profiles: Map<string, Profile>;
}

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function DateBadge({ ms }: { ms: number }) {
  const d = new Date(ms);
  return (
    <div className="sched-date" aria-hidden="true">
      <span>{d.toLocaleDateString([], { weekday: "short" })}</span>
      <b>{d.getDate()}</b>
    </div>
  );
}

function meta(s: ScheduledSessionDto, youId: string, profiles: Map<string, Profile>) {
  const by = s.byUserId === youId ? "you" : (profiles.get(s.byUserId)?.name ?? "someone");
  return `${time(s.startsAtMs)} · by ${by} · ${s.goingUserIds.length} going`;
}

function RsvpButton(props: {
  session: ScheduledSessionDto;
  youId: string;
  busy: boolean;
  onRsvp(going: boolean): void;
}) {
  const going = props.session.goingUserIds.includes(props.youId);
  return (
    <button
      type="button"
      className={`btn btn-sm${going ? " rsvp-on" : ""}`}
      aria-pressed={going}
      disabled={props.busy}
      onClick={() => props.onRsvp(!going)}
    >
      {going ? "✓ Going" : "I'm in"}
    </button>
  );
}

/** The next session, on the room screen. A slim row on phones. */
/** Next full hour, as a datetime-local value. */
function nextHour(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

/** The start sheet's Later tab: every upcoming session (RSVP, cancel your own) and a schedule form. */
export function SchedulePanel(
  props: Common & {
    gateway: StudyRoomGateway;
    channelName: string;
    onChange(sessions: ScheduledSessionDto[]): void;
  },
) {
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(nextHour);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(work: () => Promise<ScheduledSessionDto[]>) {
    setBusy(true);
    setError(null);
    try {
      props.onChange(await work());
      return true;
    } catch (e) {
      setError(toGatewayError(e).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const { gateway, youId } = props;
  return (
    <>
      {props.sessions.length === 0 ? (
        <div className="small muted">Nothing scheduled yet.</div>
      ) : (
        <ul className="sched-list">
          {props.sessions.map((s) => (
            <li key={s.id} className="sched-item">
              <DateBadge ms={s.startsAtMs} />
              <div className="sched-body">
                <div className="sched-title">{s.title}</div>
                <div className="sched-meta">{meta(s, youId, props.profiles)}</div>
              </div>
              <RsvpButton
                session={s}
                youId={youId}
                busy={busy}
                onRsvp={(going) => void run(() => gateway.rsvpSession(s.id, going))}
              />
              {s.byUserId === youId && (
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={() => void run(() => gateway.cancelScheduledSession(s.id))}
                >
                  Cancel
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="field sched-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => gateway.scheduleSession(title, new Date(when).getTime())).then(
            (ok) => ok && setTitle(""),
          );
        }}
      >
        <span className="small muted" style={{ fontWeight: 700 }}>
          Schedule a session
        </span>
        <input
          className="input"
          aria-label="Session name"
          placeholder="Sunday exam cram"
          maxLength={LIMITS.scheduledTitleMaxLength}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="input"
          type="datetime-local"
          aria-label="When"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        <span className="tiny dim">
          {props.channelName
            ? `Study Squad posts it in #${props.channelName} now, and again when it starts, pinging everyone who's in.`
            : "Everyone in the room sees it here. Admins can pick a channel for reminders in Root's App settings."}
        </span>
        {error && (
          <div role="alert" className="small" style={{ color: "var(--coral-text)" }}>
            {error}
          </div>
        )}
        <button
          type="submit"
          className="btn btn-primary btn-start"
          disabled={busy || !title.trim() || !when}
        >
          Schedule
        </button>
      </form>
    </>
  );
}
