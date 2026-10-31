// Gives the generated networking packages a version derived from the .proto files.
// `rootsdk build proto` stamps them with the current time, which package-lock.json never
// picks up, so every build ships the same stale version for @studyroom/gen-*. Root's host
// can then keep serving an old copy of the generated code. A content hash changes exactly
// when the wire format does. Run with --check to fail when package-lock.json is out of date.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const protoDir = "networking/src";
const genPackages = ["client", "server", "shared"].map((name) => `networking/gen/${name}`);

const hash = createHash("sha256");
for (const file of fs
  .readdirSync(protoDir)
  .filter((f) => f.endsWith(".proto"))
  .sort()) {
  hash.update(file);
  hash.update(fs.readFileSync(path.join(protoDir, file)));
}
const version = `1.0.0-proto.${hash.digest("hex").slice(0, 12)}`;

const lockPath = "package-lock.json";
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const stale = genPackages.filter((dir) => lock.packages[dir]?.version !== version);

if (process.argv.includes("--check")) {
  if (stale.length > 0) {
    console.error(
      `gen version: ${stale.join(", ")} not at ${version}. Run npm run generate and commit package-lock.json.`,
    );
    process.exit(1);
  }
  console.log(`gen version: ${version}`);
  process.exit(0);
}

for (const dir of genPackages) {
  const pkgPath = path.join(dir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  if (lock.packages[dir]) lock.packages[dir].version = version;
}
if (stale.length > 0) fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
console.log(`gen version: ${version}`);
