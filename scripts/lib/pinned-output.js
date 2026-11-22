/**
 * Freshness checks for `--if-missing` (the `predev` fast path).
 *
 * Generated data must match the pinned cyoda-go version, not merely exist:
 * after bumping cyoda-go-version.json, `pnpm dev` would otherwise keep
 * serving the previous release's help, OpenAPI, schemas and config table.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Marker written into directory outputs (e.g. src/schemas/). */
export const VERSION_STAMP_FILE = '.pinned-version';

/**
 * True when every file exists, parses as JSON, and `pick(json)` equals
 * `version`. Any missing or unreadable file counts as stale.
 */
export function jsonFilesAtVersion(filePaths, pick, version) {
  return filePaths.every((filePath) => {
    try {
      return pick(JSON.parse(fs.readFileSync(filePath, 'utf8'))) === version;
    } catch {
      return false;
    }
  });
}

/** True when `dir` carries a version stamp equal to `version`. */
export function dirAtVersion(dir, version) {
  try {
    return fs.readFileSync(path.join(dir, VERSION_STAMP_FILE), 'utf8').trim() === version;
  } catch {
    return false;
  }
}

/** Stamp `dir` with `version` after a successful write. */
export function stampDir(dir, version) {
  fs.writeFileSync(path.join(dir, VERSION_STAMP_FILE), `${version}\n`, 'utf8');
}
