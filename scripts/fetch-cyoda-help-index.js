import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSET_BASENAME = (version) => `cyoda_help_${version}.json`;
const JSON_URL = (version) =>
  `https://github.com/Cyoda/cyoda-go/releases/download/v${version}/${ASSET_BASENAME(version)}`;
const SUMS_URL = (version) =>
  `https://github.com/Cyoda/cyoda-go/releases/download/v${version}/SHA256SUMS`;

function err(cls, message) {
  return new Error(`${cls}: ${message}`);
}

function parsePinFile(versionFilePath) {
  let raw;
  try {
    raw = fs.readFileSync(versionFilePath, 'utf8');
  } catch (cause) {
    throw err('InvalidVersionPin', `cannot read ${versionFilePath}: ${cause.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw err('InvalidVersionPin', `${versionFilePath}: not valid JSON: ${cause.message}. Expected { "version": "<semver>" }.`);
  }
  if (!parsed || typeof parsed.version !== 'string' || !parsed.version) {
    throw err('InvalidVersionPin', `${versionFilePath}: missing string "version". Expected { "version": "<semver>" }.`);
  }
  if (parsed.version.startsWith('v')) {
    throw err('InvalidVersionPin', `${versionFilePath}: version must not start with "v" (e.g. '0.6.1', not 'v0.6.1'). Got: ${parsed.version}`);
  }
  // Strict semver — defense in depth. The version string flows into
  // outbound URLs (release-asset fetches) and into rendered HTML
  // attributes/text, so reject anything that could escape its context.
  // Allows MAJOR.MINOR.PATCH plus optional -prerelease / +build suffix
  // built from [A-Za-z0-9.-].
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/.test(parsed.version)) {
    throw err('InvalidVersionPin', `${versionFilePath}: version must be strict semver (MAJOR.MINOR.PATCH with optional -prerelease/+build). Got: ${JSON.stringify(parsed.version)}`);
  }
  return parsed.version;
}

async function fetchOrThrow(fetchFn, url, integrityClass) {
  let resp;
  try {
    resp = await fetchFn(url);
  } catch (cause) {
    throw err('FetchFailed', `${url}: ${cause.message}. Help-index step requires network access; offline builds are not supported.`);
  }
  if (!resp.ok) {
    throw err(integrityClass, `HTTP ${resp.status} on ${url}. Check cyoda-go-version.json: does the tagged release exist and include the expected asset?`);
  }
  return await resp.text();
}

function findChecksum(sumsText, filename) {
  for (const line of sumsText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2 && parts[parts.length - 1] === filename) {
      return parts[0];
    }
  }
  return null;
}

function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

function stripAndSort(helpJson) {
  if (!helpJson || !Array.isArray(helpJson.topics)) {
    throw err('HelpJsonMalformed', `expected { schema, version, topics: [...] }; got ${JSON.stringify(Object.keys(helpJson || {}))}`);
  }
  const stripped = helpJson.topics.map((t) => {
    if (!t || typeof t !== 'object' || !Array.isArray(t.path) || t.path.length === 0 || typeof t.title !== 'string') {
      throw err('HelpJsonMalformed', `topic entry missing required fields path/title: ${JSON.stringify(t)}`);
    }
    return {
      topic: t.topic ?? t.path[t.path.length - 1],
      path: t.path,
      title: t.title,
      synopsis: t.synopsis ?? '',
    };
  });
  stripped.sort((a, b) => {
    const aKey = a.path.join('/');
    const bKey = b.path.join('/');
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
  return stripped;
}

/**
 * Main fetcher entry point.
 * @param {object} opts
 * @param {typeof globalThis.fetch} opts.fetch
 * @param {string} opts.versionFilePath
 * @param {string} opts.outputPath
 * @param {string} [opts.fullOutputPath] - when set, also write the full validated payload (bodies preserved) to this path
 * @param {boolean} [opts.ifMissing] - when true, no-op if outputPath (and fullOutputPath, if set) exist
 */
export async function run({ fetch, versionFilePath, outputPath, fullOutputPath, ifMissing }) {
  if (ifMissing && fs.existsSync(outputPath) && (!fullOutputPath || fs.existsSync(fullOutputPath))) {
    return;
  }
  const version = parsePinFile(versionFilePath);
  console.log(`📚 Fetching cyoda help index (pinned v${version})...`);

  const jsonUrl = JSON_URL(version);
  const sumsUrl = SUMS_URL(version);

  const jsonText = await fetchOrThrow(fetch, jsonUrl, 'ReleaseNotFound');
  const sumsText = await fetchOrThrow(fetch, sumsUrl, 'IntegrityManifestMissing');

  const expected = findChecksum(sumsText, ASSET_BASENAME(version));
  if (!expected) {
    throw err('IntegrityManifestIncomplete', `SHA256SUMS for v${version} has no entry for ${ASSET_BASENAME(version)}.`);
  }
  const actual = sha256Hex(jsonText);
  if (actual !== expected) {
    throw err('IntegrityCheckFailed', `expected sha256 ${expected}, got ${actual} for ${ASSET_BASENAME(version)}.`);
  }

  let helpJson;
  try {
    helpJson = JSON.parse(jsonText);
  } catch (cause) {
    throw err('HelpJsonMalformed', `JSON.parse failed: ${cause.message}`);
  }

  const topics = stripAndSort(helpJson);

  const generatedAt = new Date().toISOString();

  // --- slim file: existing behaviour, unchanged ---
  const slimIndex = {
    pinnedVersion: version,
    schema: helpJson.schema ?? 1,
    generatedAt,
    topics,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(slimIndex, null, 2) + '\n');
  console.log(`   wrote ${outputPath} (${topics.length} topics, bodies stripped)`);

  // --- full file: new ---
  if (fullOutputPath) {
    // Validate every topic has a body. The generator depends on this.
    for (const t of helpJson.topics) {
      if (typeof t.body !== 'string' || t.body.length === 0) {
        throw err(
          'HelpJsonBodyMissing',
          `topic ${(t.path || []).join('/') || t.topic || '(unnamed)'} has no body in upstream JSON; the help-pages generator requires a non-empty body for every topic.`
        );
      }
    }
    const fullBundle = {
      pinnedVersion: version,
      schema: helpJson.schema ?? 1,
      generatedAt,
      topics: helpJson.topics,
    };
    fs.mkdirSync(path.dirname(fullOutputPath), { recursive: true });
    fs.writeFileSync(fullOutputPath, JSON.stringify(fullBundle, null, 2) + '\n');
    console.log(`   wrote ${fullOutputPath} (${helpJson.topics.length} topics, full)`);
  }
}

// CLI entry point
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly) {
  const projectRoot = path.resolve(__dirname, '..');
  const versionFilePath = path.join(projectRoot, 'cyoda-go-version.json');
  const outputPath = path.join(projectRoot, 'src', 'data', 'cyoda-help-index.json');
  const fullOutputPath = path.join(projectRoot, '.cyoda-cache', 'cyoda-help-full.json');
  const ifMissing = process.argv.includes('--if-missing');
  try {
    await run({ fetch: globalThis.fetch, versionFilePath, outputPath, fullOutputPath, ifMissing });
  } catch (e) {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  }
}
