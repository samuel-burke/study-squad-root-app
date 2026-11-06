// The version the generated networking packages (@studyroom/gen-*) must carry:
// a hash of the .proto files, so it changes exactly when the wire format does.
// Shared by stamp-gen-version.mjs (which writes it) and package-smoke.mjs (which
// checks the built Root package carries it).
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function protoVersion(protoDir = "networking/src") {
  const hash = createHash("sha256");
  for (const file of fs
    .readdirSync(protoDir)
    .filter((f) => f.endsWith(".proto"))
    .sort()) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(protoDir, file)));
  }
  return `1.0.0-proto.${hash.digest("hex").slice(0, 12)}`;
}
