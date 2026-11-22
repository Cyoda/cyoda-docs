import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirAtVersion, stampDir } from './lib/pinned-output.js';

import { parsePinFile, ensureBinary, err } from './lib/cyoda-binary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Error classes emitted by this fetcher (in addition to those from the helper)
// ---------------------------------------------------------------------------
//   InvalidVersionPin      — bad/missing version pin (from helper)
//   UnsupportedPlatform    — non-darwin/linux host (from helper)
//   FetchFailed            — network error during binary download (from helper)
//   BinaryNotFound         — 404 on tarball URL (from helper)
//   IntegrityCheckFailed   — SHA256 mismatch (from helper)
//   BinaryExecutionFailed  — non-zero exit from `cyoda help cloudevents json`
//   CloudEventsMalformed   — output JSON missing required top-level fields

function runCloudEventsJson(binaryPath, spawnSyncFn) {
  const result = spawnSyncFn(binaryPath, ['help', 'cloudevents', 'json'], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: 30000,
  });
  if (result.status !== 0 || result.error) {
    throw err(
      'BinaryExecutionFailed',
      `"${binaryPath} help cloudevents json" exited ${result.status}: ` +
        `${result.stderr || result.error?.message || '(no stderr)'}`
    );
  }
  return result.stdout;
}

function parseCloudEventsPayload(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (cause) {
    throw err('CloudEventsMalformed', `output is not valid JSON: ${cause.message}`);
  }
  if (
    !parsed ||
    typeof parsed.schema !== 'number' ||
    typeof parsed.version !== 'string' ||
    typeof parsed.specVersion !== 'string' ||
    typeof parsed.baseId !== 'string' ||
    !parsed.schemas ||
    typeof parsed.schemas !== 'object' ||
    Array.isArray(parsed.schemas)
  ) {
    throw err(
      'CloudEventsMalformed',
      `expected { schema, version, specVersion, baseId, schemas: {...} }; got keys: ` +
        JSON.stringify(Object.keys(parsed || {}))
    );
  }
  return parsed;
}

/**
 * Main fetcher entry point.
 *
 * @param {object} opts
 * @param {typeof globalThis.fetch} opts.fetch         — injectable fetch
 * @param {string}  opts.versionFilePath               — path to cyoda-go-version.json
 * @param {string}  opts.outputDir                     — where to write src/schemas/
 * @param {string}  opts.cacheDir                      — binary cache root
 * @param {boolean} [opts.ifMissing]                   — no-op if outputDir is stamped with the pinned version
 * @param {{platform:string,arch:string}} [opts.platformHint]
 * @param {typeof spawnSync} [opts.spawnSync]          — injectable spawnSync
 */
export async function run({
  fetch: fetchFn,
  versionFilePath,
  outputDir,
  cacheDir,
  ifMissing,
  platformHint,
  spawnSync: spawnSyncFn = spawnSync,
}) {
  const version = parsePinFile(versionFilePath);
  // --if-missing: skip only if outputDir was written for the pinned version
  if (ifMissing && dirAtVersion(outputDir, version)) {
    return;
  }
  console.log(`🧬 Fetching cyoda CloudEvent schemas (pinned v${version})...`);

  const versionCacheDir = path.join(cacheDir, `v${version}`);
  const binaryPath = await ensureBinary({
    version,
    cacheDir: versionCacheDir,
    fetch: fetchFn,
    platformHint,
    spawnSync: spawnSyncFn,
  });

  const stdout = runCloudEventsJson(binaryPath, spawnSyncFn);
  const payload = parseCloudEventsPayload(stdout);

  // Delete existing outputDir and re-fan-out all schemas
  fs.rmSync(outputDir, { recursive: true, force: true });

  const entries = Object.entries(payload.schemas);
  let totalBytes = 0;

  for (const [relpath, schemaObj] of entries) {
    const destPath = path.join(outputDir, relpath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const content = JSON.stringify(schemaObj, null, 2) + '\n';
    fs.writeFileSync(destPath, content, 'utf8');
    totalBytes += Buffer.byteLength(content, 'utf8');
  }

  stampDir(outputDir, version);

  const totalKB = Math.round(totalBytes / 1024);
  console.log(`  wrote ${outputDir} (${entries.length} schemas, ${totalKB} KB)`);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly) {
  const projectRoot = path.resolve(__dirname, '..');
  const versionFilePath = path.join(projectRoot, 'cyoda-go-version.json');
  const outputDir = path.join(projectRoot, 'src', 'schemas');
  const cacheDir = path.join(projectRoot, '.cyoda-cache');
  const ifMissing = process.argv.includes('--if-missing');
  try {
    await run({ fetch: globalThis.fetch, versionFilePath, outputDir, cacheDir, ifMissing });
  } catch (e) {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  }
}
