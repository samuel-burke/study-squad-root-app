import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, NUMBER_LIMITS, parseSettings, SETTINGS } from "@studyroom/core";

interface ManifestItem {
  key: string;
  [kind: string]: unknown;
}
interface Manifest {
  package: { server: { launch: string; deploy: string[] }; client: { deploy: string } };
  permissions: { channel: Record<string, boolean> };
  settings: { groups: { key: string; items: ManifestItem[] }[] };
}

const manifest = JSON.parse(
  readFileSync(join(__dirname, "../../root-manifest.json"), "utf8"),
) as Manifest;
const groups = new Map(manifest.settings.groups.map((g) => [g.key, g]));

/** What Root would hand the server if an admin never touched the settings. */
function defaultsFromManifest(): Record<string, Record<string, unknown>> {
  const raw: Record<string, Record<string, unknown>> = {};
  for (const group of manifest.settings.groups) {
    raw[group.key] = {};
    for (const item of group.items) {
      const kind = Object.keys(item).find((k) => !["key", "title", "description"].includes(k))!;
      const spec = item[kind] as { defaultValue?: unknown; values?: string[] };
      raw[group.key]![item.key] =
        kind === "select" ? spec.values : kind === "channel" ? [] : spec.defaultValue;
    }
  }
  return raw;
}

describe("root-manifest.json", () => {
  it("declares exactly the settings the server reads", () => {
    for (const [, spec] of Object.entries(SETTINGS)) {
      const { group, ...items } = spec;
      const declared = groups
        .get(group)
        ?.items.map((i) => i.key)
        .sort();
      expect(declared, `group ${group}`).toEqual(Object.values(items).sort());
    }
    expect(manifest.settings.groups).toHaveLength(Object.keys(SETTINGS).length);
  });

  it("uses defaults that match the server's defaults", () => {
    expect(parseSettings(defaultsFromManifest())).toEqual(DEFAULT_CONFIG);
  });

  it("only offers select values the server accepts", () => {
    for (const group of manifest.settings.groups) {
      for (const item of group.items) {
        const select = item.select as { options: { key: string }[]; values: string[] } | undefined;
        if (!select) continue;
        const keys = select.options.map((o) => o.key);
        expect(keys, item.key).toEqual(expect.arrayContaining(select.values));
      }
    }
  });

  it("uses number fields with the server's limits for every number setting", () => {
    const numberItems = manifest.settings.groups
      .flatMap((g) => g.items)
      .filter((item) => "number" in item);
    expect(numberItems.map((i) => i.key).sort()).toEqual(Object.keys(NUMBER_LIMITS).sort());
    for (const item of numberItems) {
      const limits = NUMBER_LIMITS[item.key as keyof typeof NUMBER_LIMITS];
      expect(item.number, item.key).toEqual({
        minValue: limits.min,
        maxValue: limits.max,
        step: limits.step,
        defaultValue: limits.default,
      });
      for (const n of [limits.min, limits.max, limits.default, limits.step])
        expect(Number.isInteger(n), item.key).toBe(true);
      expect((limits.default - limits.min) % limits.step, item.key).toBe(0);
    }
  });

  it("asks only for the permissions it uses", () => {
    // Mentions let the squad bot ping the people in the room.
    expect(manifest.permissions.channel).toEqual({
      channelView: true,
      channelCreateMessage: true,
      channelCreateMessageMention: true,
    });
  });

  it("ships every workspace package the server requires", () => {
    expect(manifest.package.server.launch).toBe("server/dist/main.js");
    expect(manifest.package.server.deploy).toEqual(
      expect.arrayContaining([
        "server/dist",
        "networking/gen/server",
        "core/dist",
        "contract/dist",
      ]),
    );
    expect(manifest.package.client.deploy).toBe("client/dist");
  });
});
