import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectPlatform, parsePinFile, run } from './fetch-cyoda-openapi.js';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function tmpVersionFile(version) {
  const file = path.join(os.tmpdir(), `cyoda-go-version-openapi-${Date.now()}-${Math.random()}.json`);
  if (version !== undefined) fs.writeFileSync(file, JSON.stringify({ version }));
  return file;
}

test('detectPlatform: darwin arm64 → darwin/arm64', () => {
  const result = detectPlatform({ platform: 'darwin', arch: 'arm64' });
  assert.deepEqual(result, { os: 'darwin', arch: 'arm64' });
});

test('detectPlatform: linux x64 → linux/amd64', () => {
  const result = detectPlatform({ platform: 'linux', arch: 'x64' });
  assert.deepEqual(result, { os: 'linux', arch: 'amd64' });
});

test('detectPlatform: win32 throws UnsupportedPlatform', () => {
  assert.throws(
    () => detectPlatform({ platform: 'win32', arch: 'x64' }),
    (e) => {
      assert.match(e.message, /UnsupportedPlatform/);
      return true;
    }
  );
});

test('parsePinFile: returns bare semver from valid pin file', () => {
  const versionFile = tmpVersionFile('0.6.1');
  assert.equal(parsePinFile(versionFile), '0.6.1');
  fs.rmSync(versionFile);
});

// ---------------------------------------------------------------------------
// info.version patching
// ---------------------------------------------------------------------------

// Minimal valid OpenAPI JSON that the patcher expects ("components" present).
const FAKE_OPENAPI_SPEC = JSON.stringify({
  openapi: '3.1.0',
  info: { title: 'Cyoda API', version: '1.0' },
  components: {},
  paths: {},
});

const FAKE_OPENAPI_YAML = 'openapi: 3.1.0\ninfo:\n  version: "1.0"\n';

/**
 * Build a spawnSync stub for the openapi fetcher:
 *  - ['--version'] → returns the version string (ensureBinary fast-path)
 *  - ['help', 'openapi', 'json'] → returns FAKE_OPENAPI_SPEC
 *  - ['help', 'openapi', 'yaml'] → returns FAKE_OPENAPI_YAML
 */
function makeSpawnSync(version) {
  return (cmd, args, _opts) => {
    if (args && args.includes('--version')) {
      return { status: 0, stdout: `cyoda version ${version} (commit abc)`, stderr: '' };
    }
    if (args && args[0] === 'help' && args[1] === 'openapi' && args[2] === 'json') {
      return { status: 0, stdout: FAKE_OPENAPI_SPEC, stderr: '' };
    }
    if (args && args[0] === 'help' && args[1] === 'openapi' && args[2] === 'yaml') {
      return { status: 0, stdout: FAKE_OPENAPI_YAML, stderr: '' };
    }
    return { status: 1, stdout: '', stderr: 'unexpected call' };
  };
}

test('run: info.version in emitted JSON equals the pinned binary version', async () => {
  const versionFile = tmpVersionFile('test-pin');
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyoda-openapi-test-'));
  const outputJsonPath = path.join(tmpdir, 'openapi.json');
  const outputYamlPath = path.join(tmpdir, 'openapi.yaml');
  const cacheDir = path.join(tmpdir, 'cache');

  await run({
    fetch: async () => { throw new Error('fetch should not be called in fast-path'); },
    spawnSync: makeSpawnSync('test-pin'),
    versionFilePath: versionFile,
    outputJsonPath,
    outputYamlPath,
    cacheDir,
    platformHint: { platform: 'darwin', arch: 'arm64' },
  });

  const emitted = JSON.parse(fs.readFileSync(outputJsonPath, 'utf8'));
  assert.equal(emitted.info.version, 'test-pin', 'info.version should be patched to the pinned version');
  assert.equal(emitted.info['x-openapi-spec-version'], '1.0', 'x-openapi-spec-version should preserve the original');

  // Cleanup
  fs.rmSync(tmpdir, { recursive: true });
  fs.rmSync(versionFile);
});

for (const [label, existingVersion, expectRefetch] of [
  ['at the pinned version', 'test-pin', false],
  ['from another pinned version', 'older-pin', true],
]) {
  test(`--if-missing: ${expectRefetch ? 're-fetches' : 'short-circuits'} when the spec is ${label}`, async () => {
    const versionFile = tmpVersionFile('test-pin');
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyoda-openapi-test-'));
    const outputJsonPath = path.join(tmpdir, 'openapi.json');
    const outputYamlPath = path.join(tmpdir, 'openapi.yaml');
    fs.writeFileSync(outputJsonPath, JSON.stringify({ info: { version: existingVersion } }));
    fs.writeFileSync(outputYamlPath, 'existing: true\n');

    let spawnCalled = false;
    const stub = makeSpawnSync('test-pin');
    await run({
      fetch: async () => { throw new Error('fetch should not be called in fast-path'); },
      spawnSync: (...a) => { spawnCalled = true; return stub(...a); },
      versionFilePath: versionFile,
      outputJsonPath,
      outputYamlPath,
      cacheDir: path.join(tmpdir, 'cache'),
      ifMissing: true,
      platformHint: { platform: 'darwin', arch: 'arm64' },
    });

    assert.equal(spawnCalled, expectRefetch);
    assert.equal(JSON.parse(fs.readFileSync(outputJsonPath, 'utf8')).info.version, expectRefetch ? 'test-pin' : existingVersion);

    fs.rmSync(tmpdir, { recursive: true });
    fs.rmSync(versionFile);
  });
}
