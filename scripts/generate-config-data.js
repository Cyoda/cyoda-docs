/**
 * Build the configuration-reference data module from live binary output.
 *
 * Runs `cyoda help config all --format=json` against the pinned cyoda-go
 * binary (located or downloaded by ./lib/cyoda-binary.js, same as
 * fetch-cyoda-openapi.js and fetch-cyoda-schemas.js) and writes the
 * normalized, git-ignored src/data/cyoda-config-all.json that
 * reference/configuration.mdx renders.
 *
 * The listing is assembled by the binary at request time from a root-side
 * registry plus each registered plugin's ConfigVars(), so an out-of-tree
 * backend's variables appear with no root import.
 *
 * Before v0.8.3 the binary had no `config all` command, so this script read
 * a hand-maintained src/data/cyoda-config-all.source.json. That file is
 * retired: the version is now the pin by construction, so the config
 * reference cannot silently drift from the pinned release.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync as _spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parsePinFile, ensureBinary, err } from './lib/cyoda-binary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Re-export for tests that import these directly from this module.
export { parsePinFile };

function runBinaryCommand(spawnSync, binaryPath, args) {
  const result = spawnSync(binaryPath, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30000,
  });
  if (result.status !== 0 || result.error) {
    throw err(
      'BinaryExecutionFailed',
      `"${binaryPath} ${args.join(' ')}" exited ${result.status}: ${result.stderr || result.error?.message || '(no stderr)'}`
    );
  }
  return result.stdout;
}

/**
 * Validate + normalize the raw `cyoda help config all --format=json` payload
 * into the slim data module the docs render from.
 *
 * `type` and `default` are intentionally optional: real cyoda-go output leaves
 * `type` empty for some vars and omits `default` for many. Those render blank.
 *
 * @param {any} raw
 * @returns {{schema:number, version:string, vars:Array<{name:string,topic:string,type:string,default:string,description:string}>}}
 */
export function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw err('ConfigMalformed', `expected an object, got ${Array.isArray(raw) ? 'array' : typeof raw}`);
  }
  if (raw.schema !== 1) {
    throw err('ConfigSchemaUnsupported', `expected schema 1, got ${JSON.stringify(raw.schema)}`);
  }
  if (!Array.isArray(raw.vars) || raw.vars.length === 0) {
    throw err('ConfigMalformed', `expected a non-empty "vars" array`);
  }
  const vars = raw.vars.map((v, i) => {
    if (!v || typeof v !== 'object' || typeof v.name !== 'string' || !v.name) {
      throw err('ConfigVarMalformed', `vars[${i}] missing string "name": ${JSON.stringify(v)}`);
    }
    if (typeof v.topic !== 'string' || !v.topic) {
      throw err('ConfigVarMalformed', `vars[${i}] (${v.name}) missing string "topic"`);
    }
    return {
      name: v.name,
      topic: v.topic,
      type: typeof v.type === 'string' ? v.type : '',
      default: v.default === undefined || v.default === null ? '' : String(v.default),
      description: typeof v.description === 'string' ? v.description : '',
    };
  });
  vars.sort((a, b) =>
    a.topic < b.topic ? -1
    : a.topic > b.topic ? 1
    : a.name < b.name ? -1
    : a.name > b.name ? 1
    : 0
  );
  return {
    schema: 1,
    version: typeof raw.version === 'string' && raw.version ? raw.version : 'unknown',
    vars,
  };
}

/**
 * @param {object} opts
 * @param {typeof globalThis.fetch} opts.fetch
 * @param {string} opts.versionFilePath
 * @param {string} opts.outputPath
 * @param {string} opts.cacheDir
 * @param {boolean} [opts.ifMissing]
 * @param {{platform: string, arch: string}} [opts.platformHint]
 * @param {typeof import('node:child_process').spawnSync} [opts.spawnSync]
 */
export async function run({
  fetch: fetchFn,
  versionFilePath,
  outputPath,
  cacheDir,
  ifMissing,
  platformHint,
  spawnSync = _spawnSync,
}) {
  if (ifMissing && fs.existsSync(outputPath)) {
    return;
  }

  const version = parsePinFile(versionFilePath);
  console.log(`⚙️  Building configuration reference (pinned v${version})...`);

  const versionCacheDir = path.join(cacheDir, `v${version}`);
  const binaryPath = await ensureBinary({
    version,
    cacheDir: versionCacheDir,
    fetch: fetchFn,
    spawnSync,
    platformHint,
  });

  const stdout = runBinaryCommand(spawnSync, binaryPath, ['help', 'config', 'all', '--format=json']);
  let raw;
  try {
    raw = JSON.parse(stdout);
  } catch (cause) {
    throw err('BinaryExecutionFailed', `"cyoda help config all --format=json" produced invalid JSON: ${cause.message}`);
  }

  const normalized = normalizeConfig(raw);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(normalized, null, 2) + '\n');

  const topics = new Set(normalized.vars.map((v) => v.topic)).size;
  console.log(`  wrote ${outputPath} (${normalized.vars.length} vars, ${topics} topics, v${normalized.version})`);
}

// CLI entry point
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly) {
  const projectRoot = path.resolve(__dirname, '..');
  const versionFilePath = path.join(projectRoot, 'cyoda-go-version.json');
  const outputPath = path.join(projectRoot, 'src', 'data', 'cyoda-config-all.json');
  const cacheDir = path.join(projectRoot, '.cyoda-cache');
  const ifMissing = process.argv.includes('--if-missing');
  try {
    await run({ fetch: globalThis.fetch, versionFilePath, outputPath, cacheDir, ifMissing });
  } catch (e) {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  }
}
