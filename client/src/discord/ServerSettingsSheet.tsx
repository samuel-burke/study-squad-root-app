import { useEffect, useState } from "react";
import manifest from "../../../root-manifest.json";
import { toGatewayError } from "../api/gateway";
import { Sheet } from "../components/Sheet";
import { Toggle } from "../components/Toggle";
import { request } from "./clientApp";

type Values = Record<string, Record<string, unknown>>;
interface Channel {
  id: string;
  name: string;
}
interface ServerSettings {
  canEdit: boolean;
  values?: Values;
  channels?: Channel[];
}
interface Item {
  key: string;
  title: string;
  description: string;
  checkbox?: { defaultValue: boolean };
  select?: { values: string[]; options: { key: string; value: string }[] };
  number?: { minValue: number; maxValue: number; step: number; defaultValue: number };
  channel?: unknown;
  time?: { defaultValue: { hours: number; minutes: number } };
}

// Root's App settings page, rebuilt from the same manifest so both stay in step.
// Developer test mode needs Root's chat commands, so it stays off on Discord.
const GROUPS = manifest.settings.groups.map((g) => ({
  key: g.key,
  title: g.title,
  items: (g.items as Item[]).filter((i) => i.key !== "devTestMode"),
}));

const serverWords = (text: string) =>
  text.replace(/\bcommunity\b/g, "server").replace(/\bCommunity\b/g, "Server");

export async function getServerSettings(): Promise<ServerSettings> {
  return (await request({ t: "settings" })) as unknown as ServerSettings;
}

function defaultOf(item: Item): unknown {
  if (item.checkbox) return item.checkbox.defaultValue;
  if (item.select) return item.select.values[0];
  if (item.number) return item.number.defaultValue;
  if (item.time) return item.time.defaultValue;
  return "";
}

const pad = (n: number) => String(n).padStart(2, "0");

function Control({
  item,
  value,
  channels,
  onChange,
}: {
  item: Item;
  value: unknown;
  channels: Channel[];
  onChange(value: unknown): void;
}) {
  if (item.checkbox)
    return <Toggle label={item.title} checked={value === true} onChange={onChange} />;
  if (item.select || item.channel) {
    const options = item.select
      ? item.select.options.map((o) => ({ key: o.key, label: o.value }))
      : [
          { key: "", label: "None, posts off" },
          ...channels.map((c) => ({ key: c.id, label: `#${c.name}` })),
        ];
    return (
      <select
        className="input"
        aria-label={item.title}
        value={String(Array.isArray(value) ? value[0] : (value ?? ""))}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (item.number)
    return (
      <input
        className="input"
        type="number"
        aria-label={item.title}
        min={item.number.minValue}
        max={item.number.maxValue}
        step={item.number.step}
        value={Number(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 110 }}
      />
    );
  if (item.time) {
    const t = value as { hours: number; minutes: number };
    return (
      <input
        className="input"
        type="time"
        aria-label={item.title}
        style={{ width: 140 }}
        value={`${pad(t.hours)}:${pad(t.minutes)}`}
        onChange={(e) => {
          const [hours, minutes] = e.target.value.split(":").map(Number);
          onChange({ hours, minutes, seconds: 0 });
        }}
      />
    );
  }
  return null;
}

/**
 * The server's Study Squad settings, for people with Manage Server. On Root
 * these live in Root's own App settings page; Discord has none, so here they
 * are in the Activity.
 */
export function ServerSettingsSheet({
  initial,
  onClose,
}: {
  initial: ServerSettings;
  onClose(): void;
}) {
  const [group, setGroup] = useState(GROUPS[0]!.key);
  const [values, setValues] = useState<Values>(initial.values ?? {});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const channels = initial.channels ?? [];

  const valueOf = (groupKey: string, item: Item) => values[groupKey]?.[item.key] ?? defaultOf(item);
  const set = (groupKey: string, key: string, value: unknown) => {
    setNote(null);
    setValues((v) => ({ ...v, [groupKey]: { ...v[groupKey], [key]: value } }));
  };

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const saved = (await request({ t: "settings-save", values })) as unknown as ServerSettings;
      setValues(saved.values ?? values);
      setNote("Saved. Everyone in the server sees the change now.");
    } catch (error) {
      setNote(toGatewayError(error).message);
    } finally {
      setBusy(false);
    }
  }

  const current = GROUPS.find((g) => g.key === group)!;
  return (
    <Sheet labelledBy="server-settings-title" onClose={onClose}>
      <div>
        <h1 id="server-settings-title">Server settings</h1>
        <div className="small muted">Only people with Manage Server can see this</div>
      </div>
      <div className="row" role="tablist" style={{ gap: 8 }}>
        {GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            role="tab"
            aria-selected={g.key === group}
            className={g.key === group ? "btn btn-primary" : "btn btn-quiet"}
            onClick={() => setGroup(g.key)}
          >
            {g.title}
          </button>
        ))}
      </div>
      <div role="tabpanel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {current.items.map((item) => (
          <div key={item.key} className="row-between" style={{ gap: 16 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{serverWords(item.title)}</div>
              <div className="tiny muted">{serverWords(item.description)}</div>
            </div>
            <Control
              item={item}
              value={valueOf(current.key, item)}
              channels={channels}
              onChange={(v) => set(current.key, item.key, v)}
            />
          </div>
        ))}
      </div>
      {note && (
        <div className="small" role="status">
          {note}
        </div>
      )}
      <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
        Save
      </button>
    </Sheet>
  );
}

/** The Room settings sheet's way in: a button, shown only to people who can manage the server. */
export function ServerSettingsButton({ onOpen }: { onOpen(settings: ServerSettings): void }) {
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  useEffect(() => {
    let live = true;
    getServerSettings()
      .then((s) => live && setSettings(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!settings?.canEdit) return null;
  return (
    <button type="button" className="btn" onClick={() => onOpen(settings)}>
      Server settings
    </button>
  );
}
