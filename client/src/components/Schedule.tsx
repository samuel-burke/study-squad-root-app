import { LIMITS, type ScheduledSessionDto } from "@studyroom/core";
import { useState } from "react";
import { toGatewayError, type Profile, type StudyRoomGateway } from "../api/gateway";
import { CalendarIcon } from "./Icons";
import { Sheet } from "./Sheet";

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
export function UpNext(
  props: Common & {
    compact: boolean;
    busy: boolean;
    onRsvp(id: string, going: boolean): void;
    onOpen(): void;
  },
) {
  const [next] = props.sessions;
  const rsvp = next && (
    <RsvpButton
      session={next}
      youId={props.youId}
      busy={props.busy}
      onRsvp={(going) => props.onRsvp(next.id, going)}
    />
  );
  if (props.compact) {
    return (
      <section aria-label="Up next" className="up-next-row">
        {next ? (
          <>
            <DateBadge ms={next.startsAtMs} />
            <button type="button" className="sched-body sched-open" onClick={props.onOpen}>
              <div className="sched-title">{next.title}</div>
              <div className="sched-meta">
                {time(next.startsAtMs)} · {next.goingUserIds.length} going
              </div>
            </button>
            {rsvp}
          </>
        ) : (
          <>
            <span className="sched-body small muted">No sessions scheduled</span>
            <button type="button" className="btn btn-sm" onClick={props.onOpen}>
              Schedule
            </button>
          </>
        )}
      </section>
    );
  }
  const more = props.sessions.length - 1;
  return (
    <section aria-label="Up next" className="card up-next">
      <div className="row-between">
        <div className="eyebrow">
          <CalendarIcon size={14} />
          Up next
        </div>
        {more > 0 && <span className="small muted">{more} more</span>}
      </div>
      {next ? (
        <div className="up-next-item">
          <DateBadge ms={next.startsAtMs} />
          <div className="sched-body">
            <div className="sched-title">{next.title}</div>
            <div className="sched-meta">{meta(next, props.youId, props.profiles)}</div>
          </div>
        </div>
      ) : (
        <div className="small muted">Nothing scheduled yet. Plan a session for the squad.</div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        {rsvp}
        <button type="button" className="btn btn-sm" style={{ flex: 1 }} onClick={props.onOpen}>
          {next ? "All sessions" : "Schedule a session"}
        </button>
      </div>
    </section>
  );
}

/** Next full hour, as a datetime-local value. */
function nextHour(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

/** Every upcoming session: RSVP, cancel your own, schedule a new one. */
export function ScheduleSheet(
  props: Common & {
    gateway: StudyRoomGateway;
    channelName: string;
    onChange(sessions: ScheduledSessionDto[]): void;
    onClose(): void;
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
    <Sheet labelledBy="schedule-title" onClose={props.onClose}>
      <h1 id="schedule-title">Scheduled sessions</h1>
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
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ flex: 1 }}
            disabled={busy || !title.trim() || !when}
          >
            Schedule
          </button>
          <button type="button" className="btn" style={{ flex: 1 }} onClick={props.onClose}>
            Close
          </button>
        </div>
      </form>
    </Sheet>
  );
}
