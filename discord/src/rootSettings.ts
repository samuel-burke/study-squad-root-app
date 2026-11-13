import fs from "node:fs";

/** A plain value per group and key, e.g. { room: { busyThreshold: 3 } }. */
export type PlainSettings = Record<string, Record<string, unknown>>;

interface ManifestItem {
  key: string;
  number?: { defaultValue?: number };
  checkbox?: { defaultValue?: boolean };
  select?: { values?: string[] };
  channel?: unknown;
  time?: { defaultValue?: string };
}

interface Manifest {
  settings?: { groups?: { key: string; items: ManifestItem[] }[] };
}

/**
 * Turns plain setting values into the shapes Root delivers to the server,
 * going by each item's type in root-manifest.json, so the server reads Discord
 * settings exactly like Root's. Values not given fall back to the manifest's
 * defaults, like an untouched Root settings page.
 */
export function toRootSettings(plain: PlainSettings, manifest: Manifest): PlainSettings {
  const out: PlainSettings = {};
  for (const group of manifest.settings?.groups ?? []) {
    const values = plain[group.key] ?? {};
    const delivered: Record<string, unknown> = {};
    for (const item of group.items) {
      const has = Object.prototype.hasOwnProperty.call(values, item.key);
      const v = values[item.key];
      if (item.number) {
        // Root wraps numbers.
        const n = has ? v : item.number.defaultValue;
        if (n !== undefined) delivered[item.key] = { value: n };
      } else if (item.checkbox) {
        const b = has ? v : item.checkbox.defaultValue;
        if (b !== undefined) delivered[item.key] = b;
      } else if (item.select) {
        const keys = has ? v : item.select.values;
        if (keys !== undefined) delivered[item.key] = Array.isArray(keys) ? keys : [keys];
      } else if (item.channel) {
        if (has && v) delivered[item.key] = Array.isArray(v) ? v : [v];
      } else if (item.time) {
        const t = has ? v : item.time.defaultValue;
        if (t !== undefined) delivered[item.key] = t;
      } else if (has) {
        delivered[item.key] = v;
      }
    }
    out[group.key] = delivered;
  }
  return out;
}

export function readManifest(path: string): Manifest {
  return JSON.parse(fs.readFileSync(path, "utf8")) as Manifest;
}

/** A Discord server's saved settings, or none (all defaults). */
export function readPlainSettings(file: string): PlainSettings {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as PlainSettings;
  } catch {
    return {};
  }
}
