import fs from "node:fs";
import path from "node:path";
import type { BuildInfo } from "./selfTest";

/** Reads server/dist/build-info.json (scripts/build-info.mjs). Missing means nobody can self-test. */
export function loadBuildInfo(distDir: string): BuildInfo {
  try {
    const info = JSON.parse(
      fs.readFileSync(path.join(distDir, "build-info.json"), "utf8"),
    ) as Partial<BuildInfo>;
    return {
      version: String(info.version ?? "unknown"),
      genVersion: String(info.genVersion ?? "unknown"),
      selfTestUserIds: idList(info.selfTestUserIds),
      settingTypes: info.settingTypes,
    };
  } catch {
    return {
      version: "unknown",
      genVersion: "unknown",
      selfTestUserIds: [],
    };
  }
}

const idList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

/**
 * The version of the generated networking code this process actually loaded,
 * which is what Root's cache decides. Differs from the built-for version when
 * Root serves a stale copy.
 */
export function loadedGenVersion(fromDir: string): string {
  try {
    const file = require.resolve("@studyroom/gen-shared/package.json", { paths: [fromDir] });
    return String((JSON.parse(fs.readFileSync(file, "utf8")) as { version?: unknown }).version);
  } catch {
    try {
      const entry = require.resolve("@studyroom/gen-shared", { paths: [fromDir] });
      let dir = path.dirname(entry);
      while (dir !== path.dirname(dir)) {
        const pkg = path.join(dir, "package.json");
        if (fs.existsSync(pkg))
          return String(
            (JSON.parse(fs.readFileSync(pkg, "utf8")) as { version?: unknown }).version,
          );
        dir = path.dirname(dir);
      }
    } catch {
      // fall through
    }
    return "unknown";
  }
}
