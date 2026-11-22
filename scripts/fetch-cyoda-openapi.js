import fs from 'node:fs';
import path from 'node:path';
import { spawnSync as _spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { jsonFilesAtVersion } from './lib/pinned-output.js';

import { parsePinFile, detectPlatform, ensureBinary, err } from './lib/cyoda-binary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Re-export for tests that import these directly from this module.
export { parsePinFile, detectPlatform };

function runBinaryCommand(spawnSync, binaryPath, args) {
  const result = spawnSync(binaryPath, args, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
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
 * Main fetcher entry point.
 * @param {object} opts
 * @param {typeof globalThis.fetch} opts.fetch
 * @param {string} opts.versionFilePath
 * @param {string} opts.outputJsonPath
 * @param {string} opts.outputYamlPath
 * @param {string} opts.cacheDir
 * @param {boolean} [opts.ifMissing]
 * @param {{platform: string, arch: string}} [opts.platformHint]
 * @param {typeof import('node:child_process').spawnSync} [opts.spawnSync]
 */
export async function run({
  fetch: fetchFn,
  versionFilePath,
  outputJsonPath,
  outputYamlPath,
  cacheDir,
  ifMissing,
  platformHint,
  spawnSync = _spawnSync,
}) {
  const version = parsePinFile(versionFilePath);
  if (
    ifMissing &&
    fs.existsSync(outputYamlPath) &&
    jsonFilesAtVersion([outputJsonPath], (j) => j.info?.version, version)
  ) {
    return;
  }
  console.log(`📘 Fetching cyoda OpenAPI spec (pinned v${version})...`);

  const versionCacheDir = path.join(cacheDir, `v${version}`);
  const binaryPath = await ensureBinary({
    version,
    cacheDir: versionCacheDir,
    fetch: fetchFn,
    spawnSync,
    platformHint,
  });

  // Run: cyoda help openapi json
  const jsonOutput = runBinaryCommand(spawnSync, binaryPath, ['help', 'openapi', 'json']);
  let parsed;
  try {
    parsed = JSON.parse(jsonOutput);
  } catch (cause) {
    throw err('BinaryExecutionFailed', `"cyoda help openapi json" produced invalid JSON: ${cause.message}`);
  }
  if (!parsed || typeof parsed.components !== 'object') {
    throw err('BinaryExecutionFailed', `"cyoda help openapi json" output is missing expected "components" key.`);
  }

  // Patch info.version to the pinned cyoda-go binary version.
  // The spec embeds its own spec-self version (e.g. "1.0"); stash that
  // as x-openapi-spec-version so the original value is not lost.
  if (parsed.info) {
    parsed.info['x-openapi-spec-version'] = parsed.info.version;
    parsed.info.version = version;
  }
  const patchedJson = JSON.stringify(parsed, null, 2) + '\n';

  // Run: cyoda help openapi yaml
  const yamlOutput = runBinaryCommand(spawnSync, binaryPath, ['help', 'openapi', 'yaml']);

  // Write outputs
  fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(outputYamlPath), { recursive: true });

  fs.writeFileSync(outputJsonPath, patchedJson);
  fs.writeFileSync(outputYamlPath, yamlOutput);

  const jsonKB = Math.round(Buffer.byteLength(patchedJson, 'utf8') / 1024);
  const yamlKB = Math.round(Buffer.byteLength(yamlOutput, 'utf8') / 1024);
  console.log(`  wrote ${outputJsonPath} (${jsonKB} KB)`);
  console.log(`  wrote ${outputYamlPath} (${yamlKB} KB)`);
}

// CLI entry point
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly) {
  const projectRoot = path.resolve(__dirname, '..');
  const versionFilePath = path.join(projectRoot, 'cyoda-go-version.json');
  const outputJsonPath = path.join(projectRoot, 'public', 'openapi', 'openapi.json');
  const outputYamlPath = path.join(projectRoot, 'public', 'openapi', 'openapi.yaml');
  const cacheDir = path.join(projectRoot, '.cyoda-cache');
  const ifMissing = process.argv.includes('--if-missing');
  try {
    await run({ fetch: globalThis.fetch, versionFilePath, outputJsonPath, outputYamlPath, cacheDir, ifMissing });
  } catch (e) {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  }
}
