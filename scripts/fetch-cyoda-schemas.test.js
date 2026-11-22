import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { run } from './fetch-cyoda-schemas.js';

function tmpVersionFile(version) {
  const file = path.join(os.tmpdir(), `cyoda-go-version-schemas-${Date.now()}-${Math.random()}.json`);
  if (version !== undefined) fs.writeFileSync(file, JSON.stringify({ version }));
  return file;
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cyoda-schemas-test-'));
}

// A minimal valid cloudevents json payload
const VALID_PAYLOAD = {
  schema: 1,
  version: '0.6.2',
  specVersion: 'https://json-schema.org/draft/2020-12/schema',
  baseId: 'https://cyoda.com/cloud/event/',
  schemas: {
    'foo/Bar.json': {
      $id: 'https://cyoda.com/cloud/event/foo/Bar.json',
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'Bar',
      type: 'object',
      properties: { id: { type: 'string' } },
    },
    'baz/Qux.json': {
      $id: 'https://cyoda.com/cloud/event/baz/Qux.json',
      title: 'Qux',
      type: 'object',
    },
  },
};

/**
 * Build a spawnSync stub that returns the given payload as stdout when
 * called with ['help', 'cloudevents', 'json'], and returns a version
 * string for ['--version'] (for the ensureBinary fast-path).
 */
function makeSpawnSync(version, payload) {
  const payloadStr = JSON.stringify(payload);
  return (cmd, args, _opts) => {
    if (args && args.includes('--version')) {
      return { status: 0, stdout: `cyoda version ${version} (commit abc)`, stderr: '' };
    }
    if (args && args[0] === 'help' && args[1] === 'cloudevents') {
      return { status: 0, stdout: payloadStr, stderr: '' };
    }
    return { status: 1, stdout: '', stderr: 'unexpected call' };
  };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test('happy path: fans out schemas into outputDir', async () => {
  const versionFile = tmpVersionFile('0.6.2');
  const outputDir = tmpDir();
  const cacheDir = tmpDir();

  await run({
    fetch: async () => { throw new Error('fetch should not be called in fast-path'); },
    spawnSync: makeSpawnSync('0.6.2', VALID_PAYLOAD),
    versionFilePath: versionFile,
    outputDir,
    cacheDir,
    platformHint: { platform: 'darwin', arch: 'arm64' },
  });

  // Both schema files should exist
  const barPath = path.join(outputDir, 'foo', 'Bar.json');
  const quxPath = path.join(outputDir, 'baz', 'Qux.json');
  assert.ok(fs.existsSync(barPath), 'foo/Bar.json should exist');
  assert.ok(fs.existsSync(quxPath), 'baz/Qux.json should exist');

  // Content should round-trip via JSON.parse (2-space indent + trailing newline)
  const barContent = fs.readFileSync(barPath, 'utf8');
  assert.ok(barContent.endsWith('\n'), 'should end with newline');
  const barParsed = JSON.parse(barContent);
  assert.deepEqual(barParsed, VALID_PAYLOAD.schemas['foo/Bar.json']);

  fs.rmSync(versionFile);
  fs.rmSync(outputDir, { recursive: true });
  fs.rmSync(cacheDir, { recursive: true });
});

// ---------------------------------------------------------------------------
// CloudEventsMalformed
// ---------------------------------------------------------------------------

test('CloudEventsMalformed: missing schemas key', async () => {
  const versionFile = tmpVersionFile('0.6.2');
  const outputDir = tmpDir();
  const cacheDir = tmpDir();

  const badPayload = { schema: 1, version: '0.6.2', specVersion: 's', baseId: 'b' };
  // no `schemas` key

  const error = await run({
    fetch: async () => { throw new Error('no fetch'); },
    spawnSync: makeSpawnSync('0.6.2', badPayload),
    versionFilePath: versionFile,
    outputDir,
    cacheDir,
    platformHint: { platform: 'darwin', arch: 'arm64' },
  }).catch((e) => e);

  assert.ok(error instanceof Error, 'should throw');
  assert.match(error.message, /CloudEventsMalformed/);

  fs.rmSync(versionFile);
  fs.rmSync(outputDir, { recursive: true });
  fs.rmSync(cacheDir, { recursive: true });
});

test('CloudEventsMalformed: binary returns invalid JSON', async () => {
  const versionFile = tmpVersionFile('0.6.2');
  const outputDir = tmpDir();
  const cacheDir = tmpDir();

  const badSpawnSync = (cmd, args, _opts) => {
    if (args && args.includes('--version')) {
      return { status: 0, stdout: 'cyoda version 0.6.2 (commit abc)', stderr: '' };
    }
    return { status: 0, stdout: 'this is not { json }', stderr: '' };
  };

  const error = await run({
    fetch: async () => { throw new Error('no fetch'); },
    spawnSync: badSpawnSync,
    versionFilePath: versionFile,
    outputDir,
    cacheDir,
    platformHint: { platform: 'darwin', arch: 'arm64' },
  }).catch((e) => e);

  assert.ok(error instanceof Error, 'should throw');
  assert.match(error.message, /CloudEventsMalformed/);

  fs.rmSync(versionFile);
  fs.rmSync(outputDir, { recursive: true });
  fs.rmSync(cacheDir, { recursive: true });
});

// ---------------------------------------------------------------------------
// --if-missing: short-circuits when outputDir already has .json files
// ---------------------------------------------------------------------------

test('--if-missing: short-circuits when outputDir is stamped with the pinned version', async () => {
  const versionFile = tmpVersionFile('0.6.2');
  const outputDir = tmpDir();
  const cacheDir = tmpDir();

  fs.writeFileSync(path.join(outputDir, 'existing.json'), '{"already":"here"}');
  fs.writeFileSync(path.join(outputDir, '.pinned-version'), '0.6.2\n');

  let spawnCalled = false;
  const spySpawnSync = (...args) => {
    spawnCalled = true;
    return { status: 0, stdout: '', stderr: '' };
  };

  await run({
    fetch: async () => { throw new Error('no fetch'); },
    spawnSync: spySpawnSync,
    versionFilePath: versionFile,
    outputDir,
    cacheDir,
    ifMissing: true,
    platformHint: { platform: 'darwin', arch: 'arm64' },
  });

  assert.equal(spawnCalled, false, 'spawnSync should not have been called');

  fs.rmSync(versionFile);
  fs.rmSync(outputDir, { recursive: true });
  fs.rmSync(cacheDir, { recursive: true });
});

for (const [label, stamp] of [['unstamped', null], ['stamped with another version', '0.6.1']]) {
  test(`--if-missing: re-fetches when outputDir is ${label}`, async () => {
    const versionFile = tmpVersionFile('0.6.2');
    const outputDir = tmpDir();
    const cacheDir = tmpDir();
    fs.writeFileSync(path.join(outputDir, 'existing.json'), '{"already":"here"}');
    if (stamp) fs.writeFileSync(path.join(outputDir, '.pinned-version'), `${stamp}\n`);

    await run({
      fetch: async () => { throw new Error('no fetch'); },
      spawnSync: makeSpawnSync('0.6.2', VALID_PAYLOAD),
      versionFilePath: versionFile,
      outputDir,
      cacheDir,
      ifMissing: true,
      platformHint: { platform: 'darwin', arch: 'arm64' },
    });

    assert.equal(fs.existsSync(path.join(outputDir, 'existing.json')), false, 'stale schemas are replaced');
    assert.equal(fs.existsSync(path.join(outputDir, 'foo/Bar.json')), true);
    assert.equal(fs.readFileSync(path.join(outputDir, '.pinned-version'), 'utf8').trim(), '0.6.2');

    fs.rmSync(versionFile);
    fs.rmSync(outputDir, { recursive: true });
    fs.rmSync(cacheDir, { recursive: true });
  });
}
